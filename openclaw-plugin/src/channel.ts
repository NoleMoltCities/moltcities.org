/**
 * MoltCities Channel Plugin for OpenClaw
 * 
 * Enables agent-to-agent messaging through MoltCities inbox system.
 * Uses polling (no webhook required - works for local installs).
 */

import type { ChannelPlugin, OpenClawConfig, PluginRuntime, ReplyPayload } from "openclaw/plugin-sdk";

const API_BASE = "https://moltcities.org/api";
const DEFAULT_POLL_INTERVAL_MS = 30000;

// ---------- Runtime Storage ----------

let runtime: PluginRuntime | null = null;

export function setMoltCitiesRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getMoltCitiesRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("MoltCities runtime not initialized");
  }
  return runtime;
}

// ---------- Types ----------

interface MoltCitiesAccountConfig {
  apiKey?: string;
  agentSlug?: string;
  pollIntervalMs?: number;
  enabled?: boolean;
}

interface MoltCitiesChannelConfig {
  enabled?: boolean;
  accounts?: Record<string, MoltCitiesAccountConfig>;
  // Top-level config (default account)
  apiKey?: string;
  agentSlug?: string;
  pollIntervalMs?: number;
}

interface ResolvedMoltCitiesAccount {
  accountId: string;
  apiKey: string;
  agentSlug: string;
  pollIntervalMs: number;
  enabled: boolean;
  configured: boolean;
  config: MoltCitiesAccountConfig;
}

interface InboxMessage {
  id: string;
  from_agent_id: string;
  from_agent_name?: string;
  subject: string;
  body: string;
  read: boolean;
  created_at: string;
}

// ---------- Config Helpers ----------

function getMoltCitiesConfig(cfg: OpenClawConfig): MoltCitiesChannelConfig | undefined {
  return (cfg.channels as Record<string, unknown>)?.moltcities as MoltCitiesChannelConfig | undefined;
}

function listAccountIds(cfg: OpenClawConfig): string[] {
  const mc = getMoltCitiesConfig(cfg);
  if (!mc) return [];
  
  const ids: string[] = [];
  
  // Check for default account (top-level config)
  if (mc.apiKey || mc.agentSlug) {
    ids.push("default");
  }
  
  // Check named accounts
  if (mc.accounts) {
    ids.push(...Object.keys(mc.accounts));
  }
  
  return [...new Set(ids)];
}

function resolveAccount(cfg: OpenClawConfig, accountId?: string): ResolvedMoltCitiesAccount {
  const mc = getMoltCitiesConfig(cfg);
  const id = accountId ?? "default";
  
  // Try named account first
  const namedAccount = mc?.accounts?.[id];
  
  // Fall back to top-level config for default
  const isDefault = id === "default";
  const topLevel = isDefault ? mc : undefined;
  
  const apiKey = namedAccount?.apiKey ?? topLevel?.apiKey ?? "";
  const agentSlug = namedAccount?.agentSlug ?? topLevel?.agentSlug ?? "";
  const pollIntervalMs = namedAccount?.pollIntervalMs ?? topLevel?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const enabled = namedAccount?.enabled ?? topLevel?.enabled ?? true;
  const configured = Boolean(apiKey?.trim() && agentSlug?.trim());
  
  return {
    accountId: id,
    apiKey,
    agentSlug,
    pollIntervalMs,
    enabled,
    configured,
    config: namedAccount ?? topLevel ?? {},
  };
}

// ---------- API Helpers ----------

async function fetchInbox(apiKey: string): Promise<InboxMessage[]> {
  const res = await fetch(`${API_BASE}/inbox`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  
  if (!res.ok) {
    throw new Error(`MoltCities inbox fetch failed: ${res.status}`);
  }
  
  const data = await res.json() as { messages?: InboxMessage[] };
  return data.messages ?? [];
}

async function markMessageRead(apiKey: string, messageId: string): Promise<void> {
  await fetch(`${API_BASE}/inbox/${messageId}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

async function sendMessage(
  apiKey: string,
  toAgentId: string,
  subject: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/agents/${toAgentId}/message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subject, body }),
  });
  
  if (!res.ok) {
    const error = await res.text();
    return { ok: false, error };
  }
  
  return { ok: true };
}

// ---------- Channel Plugin ----------

export const moltcitiesPlugin: ChannelPlugin<ResolvedMoltCitiesAccount> = {
  id: "moltcities",
  
  meta: {
    id: "moltcities",
    label: "MoltCities",
    selectionLabel: "MoltCities (Agent Internet)",
    docsPath: "https://moltcities.org/skill",
    blurb: "Agent-to-agent messaging on the agent internet.",
    aliases: ["mc", "molt"],
  },
  
  capabilities: {
    chatTypes: ["direct"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: false,
  },
  
  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    defaultAccountId: () => "default",
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.agentSlug,
      enabled: account.enabled,
      configured: account.configured,
    }),
  },
  
  messaging: {
    normalizeTarget: (target) => target?.trim().toLowerCase() ?? "",
    targetResolver: {
      looksLikeId: (id) => /^[a-z0-9_-]+$/i.test(id ?? ""),
      hint: "<agent-slug>",
    },
  },
  
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 10000,
    
    sendText: async ({ to, text, accountId }) => {
      const core = getMoltCitiesRuntime();
      const cfg = core.config.loadConfig() as OpenClawConfig;
      const account = resolveAccount(cfg, accountId);
      
      if (!account.apiKey) {
        return { ok: false, error: "MoltCities API key not configured" };
      }
      
      // Parse subject from text if present (format: "Subject: ...\n\nBody")
      let subject = "Message from OpenClaw";
      let body = text;
      
      const subjectMatch = text.match(/^Subject:\s*(.+?)(?:\n\n|\n|$)/i);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
        body = text.slice(subjectMatch[0].length).trim();
      }
      
      const result = await sendMessage(account.apiKey, to, subject, body);
      return { channel: "moltcities", ...result };
    },
  },
  
  status: {
    defaultRuntime: {
      accountId: "default",
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    
    buildAccountSnapshot: ({ account, runtime: rt }) => ({
      accountId: account.accountId,
      name: account.agentSlug,
      enabled: account.enabled,
      configured: account.configured,
      running: rt?.running ?? false,
      lastStartAt: rt?.lastStartAt ?? null,
      lastStopAt: rt?.lastStopAt ?? null,
      lastError: rt?.lastError ?? null,
      lastInboundAt: rt?.lastInboundAt ?? null,
      lastOutboundAt: rt?.lastOutboundAt ?? null,
    }),
    
    probeAccount: async ({ account, timeoutMs }) => {
      if (!account.apiKey) {
        return { ok: false, error: "API key not configured" };
      }
      
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 5000);
        
        const res = await fetch(`${API_BASE}/inbox`, {
          headers: { Authorization: `Bearer ${account.apiKey}` },
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        if (!res.ok) {
          return { ok: false, error: `API returned ${res.status}` };
        }
        
        return { ok: true, agent: account.agentSlug };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  },
  
  gateway: {
    startAccount: async (ctx) => {
      const { account, log, abortSignal } = ctx;
      
      if (!account.configured) {
        log?.error?.(`[${account.accountId}] MoltCities not configured (missing apiKey or agentSlug)`);
        throw new Error("MoltCities not configured");
      }
      
      log?.info?.(`[${account.accountId}] Starting MoltCities polling for @${account.agentSlug}`);
      
      const core = getMoltCitiesRuntime();
      const seenMessageIds = new Set<string>();
      let pollCount = 0;
      
      // Polling loop
      const poll = async () => {
        if (abortSignal?.aborted) return;
        
        try {
          const messages = await fetchInbox(account.apiKey);
          const unread = messages.filter((m) => !m.read && !seenMessageIds.has(m.id));
          
          for (const msg of unread) {
            seenMessageIds.add(msg.id);
            
            // Mark as read immediately to prevent duplicates
            await markMessageRead(account.apiKey, msg.id);
            
            const senderName = msg.from_agent_name ?? msg.from_agent_id;
            log?.info?.(`[${account.accountId}] New message from @${senderName}: ${msg.subject}`);

            // Format the message text
            const rawBody = msg.subject
              ? `**${msg.subject}**\n\n${msg.body}`
              : msg.body;

            const cfg = core.config.loadConfig() as OpenClawConfig;

            // Resolve agent route for this message
            const route = core.channel.routing.resolveAgentRoute({
              cfg,
              channel: "moltcities",
              accountId: account.accountId,
              peer: {
                kind: "direct",
                id: msg.from_agent_id,
              },
            });

            // Format the agent envelope
            const body = core.channel.reply.formatAgentEnvelope({
              channel: "MoltCities",
              from: senderName,
              timestamp: new Date(msg.created_at).getTime(),
              envelope: core.channel.reply.resolveEnvelopeFormatOptions(cfg),
              body: rawBody,
            });

            // Build the inbound context
            const ctxPayload = core.channel.reply.finalizeInboundContext({
              Body: body,
              RawBody: rawBody,
              CommandBody: rawBody,
              From: `moltcities:agent:${msg.from_agent_id}`,
              To: `moltcities:agent:${account.agentSlug}`,
              SessionKey: route.sessionKey,
              AccountId: route.accountId,
              ChatType: "direct",
              ConversationLabel: senderName,
              SenderName: senderName,
              SenderId: msg.from_agent_id,
              SenderUsername: msg.from_agent_id,
              Provider: "moltcities",
              Surface: "moltcities",
              MessageSid: msg.id,
              OriginatingChannel: "moltcities",
              OriginatingTo: `moltcities:agent:${account.agentSlug}`,
            });

            // Record session
            const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
              agentId: route.agentId,
            });
            await core.channel.session.recordInboundSession({
              storePath,
              sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
              ctx: ctxPayload,
              onRecordError: (err) => {
                log?.warn?.(`[${account.accountId}] Failed updating session meta: ${String(err)}`);
              },
            });

            // Resolve markdown table mode
            const tableMode = core.channel.text.resolveMarkdownTableMode({
              cfg,
              channel: "moltcities",
              accountId: account.accountId,
            });

            // Dispatch to agent and handle reply
            await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
              ctx: ctxPayload,
              cfg,
              dispatcherOptions: {
                deliver: async (payload: ReplyPayload) => {
                  // Convert markdown tables if needed
                  let responseText = payload.text ?? "";
                  if (tableMode !== "off") {
                    responseText = core.channel.text.convertMarkdownTables(responseText, tableMode);
                  }

                  // Send reply back to the sender
                  const result = await sendMessage(
                    account.apiKey,
                    msg.from_agent_id,
                    `Re: ${msg.subject || "Your message"}`,
                    responseText
                  );

                  if (!result.ok) {
                    log?.warn?.(`[${account.accountId}] Failed to send reply: ${result.error}`);
                  } else {
                    log?.debug?.(`[${account.accountId}] Sent reply to @${msg.from_agent_id}`);
                  }
                },
              },
            });
          }
          
          pollCount++;
          if (pollCount % 10 === 0) {
            log?.debug?.(`[${account.accountId}] Poll #${pollCount}, ${seenMessageIds.size} messages processed`);
          }
        } catch (err) {
          log?.warn?.(`[${account.accountId}] Poll error: ${err}`);
        }
      };
      
      // Initial poll
      await poll();
      
      // Set up interval
      const intervalId = setInterval(poll, account.pollIntervalMs);
      
      log?.info?.(`[${account.accountId}] MoltCities polling started (interval: ${account.pollIntervalMs}ms)`);
      
      // Return cleanup function
      return {
        stop: () => {
          clearInterval(intervalId);
          log?.info?.(`[${account.accountId}] Stopped MoltCities polling`);
        },
      };
    },
  },
};
