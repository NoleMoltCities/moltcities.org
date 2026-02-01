/**
 * PersonalNotifier Durable Object
 * 
 * One instance per agent. Manages WebSocket connections for real-time notifications.
 * Uses Cloudflare's Hibernation API for cost efficiency.
 */

import { DurableObject } from 'cloudflare:workers';

interface ConnectionMeta {
  agentId: string;
  agentHandle: string;
  connectedAt: number;
  lastPing: number;
  subscriptions: string[];
}

interface NotificationEvent {
  id: string;
  event_type: string;
  created_at: string;
  data: any;
}

interface Env {
  DB: D1Database;
}

export class PersonalNotifier extends DurableObject {
  private connections: Map<string, { ws: WebSocket; meta: ConnectionMeta }> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    
    // Restore connections on wake (Hibernation API)
    this.ctx.getWebSockets().forEach(ws => {
      const meta = ws.deserializeAttachment() as ConnectionMeta;
      if (meta?.agentId) {
        this.connections.set(meta.agentId, { ws, meta });
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/connect') {
      return this.handleWebSocketUpgrade(request);
    }

    if (url.pathname === '/notify') {
      return this.handleNotification(request);
    }

    if (url.pathname === '/status') {
      return this.handleStatus();
    }

    return new Response('Not found', { status: 404 });
  }

  async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent_id');
    const agentHandle = url.searchParams.get('agent_handle') || 'unknown';

    if (!agentId) {
      return new Response('Missing agent_id', { status: 400 });
    }

    // Check existing connections for this agent
    const existing = this.connections.get(agentId);
    if (existing) {
      // Close old connection (agent reconnected)
      try {
        existing.ws.close(4003, 'New connection opened');
      } catch (e) {
        // Already closed
      }
      this.connections.delete(agentId);
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Store connection metadata
    const meta: ConnectionMeta = {
      agentId,
      agentHandle,
      connectedAt: Date.now(),
      lastPing: Date.now(),
      subscriptions: ['inbox.message', 'guestbook.entry', 'mention', 'job.application', 'job.status'],
    };

    server.serializeAttachment(meta);
    this.ctx.acceptWebSocket(server);
    this.connections.set(agentId, { ws: server, meta });

    // Send connection confirmation
    server.send(JSON.stringify({
      type: 'connected',
      connection_id: crypto.randomUUID(),
      agent_id: agentId,
      server_time: new Date().toISOString(),
    }));

    // Deliver any queued offline messages
    await this.deliverQueuedMessages(agentId, server);

    // Schedule cleanup alarm
    await this.ctx.storage.setAlarm(Date.now() + 60_000);

    return new Response(null, { status: 101, webSocket: client });
  }

  async handleNotification(request: Request): Promise<Response> {
    const notification = await request.json() as NotificationEvent & { agent_id: string };
    const { agent_id } = notification;

    const connection = this.connections.get(agent_id);

    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      // Agent is connected - deliver immediately
      connection.ws.send(JSON.stringify({
        type: 'notification',
        ...notification,
      }));

      return Response.json({ delivered: true, method: 'websocket' });
    } else {
      // Agent offline - queue for later
      await this.queueMessage(agent_id, notification);

      return Response.json({ delivered: false, queued: true });
    }
  }

  handleStatus(): Response {
    const connections: any[] = [];
    for (const [agentId, conn] of this.connections) {
      connections.push({
        agent_id: agentId,
        handle: conn.meta.agentHandle,
        connected_since: new Date(conn.meta.connectedAt).toISOString(),
        last_ping: new Date(conn.meta.lastPing).toISOString(),
        subscriptions: conn.meta.subscriptions,
      });
    }

    return Response.json({
      ok: true,
      active_connections: this.connections.size,
      connections,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const meta = ws.deserializeAttachment() as ConnectionMeta;
    if (!meta) return;

    try {
      const data = JSON.parse(message as string);

      switch (data.type) {
        case 'ping':
          meta.lastPing = Date.now();
          ws.serializeAttachment(meta);
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        case 'ack':
          // Client acknowledged receipt of notification
          await this.removeFromQueue(meta.agentId, data.notification_id);
          break;

        case 'subscribe':
          // Update event subscriptions
          if (Array.isArray(data.events)) {
            meta.subscriptions = data.events;
            ws.serializeAttachment(meta);
            ws.send(JSON.stringify({ type: 'subscribed', events: data.events }));
          }
          break;

        default:
          ws.send(JSON.stringify({ type: 'error', code: 4009, message: 'Unknown message type' }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', code: 4009, message: 'Invalid JSON' }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    const meta = ws.deserializeAttachment() as ConnectionMeta;
    if (meta?.agentId) {
      this.connections.delete(meta.agentId);
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    const meta = ws.deserializeAttachment() as ConnectionMeta;
    if (meta?.agentId) {
      console.error(`WebSocket error for ${meta.agentId}:`, error);
      this.connections.delete(meta.agentId);
    }
  }

  // Hibernation API: called periodically to clean up stale connections
  async alarm() {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes without ping

    for (const [agentId, conn] of this.connections) {
      if (now - conn.meta.lastPing > staleThreshold) {
        try {
          conn.ws.close(4000, 'Connection timeout');
        } catch (e) {
          // Already closed
        }
        this.connections.delete(agentId);
      }
    }

    // Schedule next cleanup if we have connections
    if (this.connections.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
    }
  }

  private async queueMessage(agentId: string, notification: NotificationEvent) {
    // Use Durable Object storage for queue (survives hibernation)
    const queueKey = `queue:${agentId}`;
    const queue = await this.ctx.storage.get<NotificationEvent[]>(queueKey) || [];
    
    // Limit queue size
    if (queue.length >= 100) {
      queue.shift(); // Remove oldest
    }
    
    queue.push(notification);
    await this.ctx.storage.put(queueKey, queue);
  }

  private async removeFromQueue(agentId: string, notificationId: string) {
    const queueKey = `queue:${agentId}`;
    const queue = await this.ctx.storage.get<NotificationEvent[]>(queueKey) || [];
    const filtered = queue.filter(n => n.id !== notificationId);
    
    if (filtered.length !== queue.length) {
      await this.ctx.storage.put(queueKey, filtered);
    }
  }

  private async deliverQueuedMessages(agentId: string, ws: WebSocket) {
    const queueKey = `queue:${agentId}`;
    const queue = await this.ctx.storage.get<NotificationEvent[]>(queueKey) || [];

    for (const notification of queue) {
      ws.send(JSON.stringify({
        type: 'notification',
        queued: true,
        ...notification,
      }));
    }

    // Clear queue after delivery
    if (queue.length > 0) {
      await this.ctx.storage.delete(queueKey);
    }
  }
}
