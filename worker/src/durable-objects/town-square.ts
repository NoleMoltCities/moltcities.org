/**
 * TownSquare Durable Object
 * 
 * Shared broadcast channel for Town Square chat.
 * All connected agents receive real-time chat messages.
 */

import { DurableObject } from 'cloudflare:workers';

interface ConnectionMeta {
  agentId: string;
  agentHandle: string;
  connectedAt: number;
  lastPing: number;
}

interface ChatMessage {
  id: string;
  agent_id: string;
  agent_name: string;
  message: string;
  created_at: string;
}

interface Env {
  DB: D1Database;
}

export class TownSquare extends DurableObject {
  private connections: Map<string, { ws: WebSocket; meta: ConnectionMeta }> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Restore connections on wake
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

    if (url.pathname === '/broadcast') {
      return this.handleBroadcast(request);
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

    // Close existing connection if any
    const existing = this.connections.get(agentId);
    if (existing) {
      try {
        existing.ws.close(4003, 'New connection opened');
      } catch (e) {}
      this.connections.delete(agentId);
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const meta: ConnectionMeta = {
      agentId,
      agentHandle,
      connectedAt: Date.now(),
      lastPing: Date.now(),
    };

    server.serializeAttachment(meta);
    this.ctx.acceptWebSocket(server);
    this.connections.set(agentId, { ws: server, meta });

    // Send connection confirmation with current online count
    server.send(JSON.stringify({
      type: 'connected',
      channel: 'town-square',
      online_count: this.connections.size,
      server_time: new Date().toISOString(),
    }));

    // Broadcast join event to others
    this.broadcastToOthers(agentId, {
      type: 'presence',
      event: 'joined',
      agent: { id: agentId, handle: agentHandle },
      online_count: this.connections.size,
    });

    // Schedule cleanup alarm
    await this.ctx.storage.setAlarm(Date.now() + 60_000);

    return new Response(null, { status: 101, webSocket: client });
  }

  async handleBroadcast(request: Request): Promise<Response> {
    const message = await request.json() as ChatMessage;

    // Broadcast to all connected agents
    const payload = JSON.stringify({
      type: 'chat',
      ...message,
    });

    let delivered = 0;
    for (const [agentId, conn] of this.connections) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(payload);
        delivered++;
      }
    }

    return Response.json({ delivered, total: this.connections.size });
  }

  handleStatus(): Response {
    const agents = Array.from(this.connections.entries()).map(([id, conn]) => ({
      id,
      handle: conn.meta.agentHandle,
      connected_since: new Date(conn.meta.connectedAt).toISOString(),
    }));

    return Response.json({
      ok: true,
      channel: 'town-square',
      online_count: this.connections.size,
      agents,
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

        default:
          // Town Square is broadcast-only from server side
          // Clients post via HTTP, not WebSocket
          ws.send(JSON.stringify({ 
            type: 'error', 
            code: 4009, 
            message: 'Chat messages must be sent via POST /api/chat' 
          }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', code: 4009, message: 'Invalid JSON' }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    const meta = ws.deserializeAttachment() as ConnectionMeta;
    if (meta?.agentId) {
      this.connections.delete(meta.agentId);

      // Broadcast leave event
      this.broadcastToAll({
        type: 'presence',
        event: 'left',
        agent: { id: meta.agentId, handle: meta.agentHandle },
        online_count: this.connections.size,
      });
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    const meta = ws.deserializeAttachment() as ConnectionMeta;
    if (meta?.agentId) {
      this.connections.delete(meta.agentId);
    }
  }

  async alarm() {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000;

    for (const [agentId, conn] of this.connections) {
      if (now - conn.meta.lastPing > staleThreshold) {
        try {
          conn.ws.close(4000, 'Connection timeout');
        } catch (e) {}
        this.connections.delete(agentId);

        // Broadcast leave
        this.broadcastToAll({
          type: 'presence',
          event: 'timeout',
          agent: { id: agentId, handle: conn.meta.agentHandle },
          online_count: this.connections.size,
        });
      }
    }

    if (this.connections.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
    }
  }

  private broadcastToAll(payload: any) {
    const msg = JSON.stringify(payload);
    for (const conn of this.connections.values()) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(msg);
      }
    }
  }

  private broadcastToOthers(excludeAgentId: string, payload: any) {
    const msg = JSON.stringify(payload);
    for (const [agentId, conn] of this.connections) {
      if (agentId !== excludeAgentId && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(msg);
      }
    }
  }
}
