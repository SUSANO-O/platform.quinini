/**
 * Cuando el agente tiene webhook builtin configurado, el proxy por defecto va a
 * AgentFlowhub → a veces solo `/api/models` sin tools: el modelo “simula” JSON.
 * Si llamamos a AIBackHub `POST /api/mcp/widget-chat`, sí se ejecuta el POST real.
 */

import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import {
  getAibackhubBaseUrl,
  hubCreateHeaders,
  syncHubCatalogFromLandingAgentDoc,
} from '@/lib/aibackhub-sync';

export function clientAgentHasWebhookUrl(agent: {
  tools?: Array<{ toolId?: string; config?: unknown }>;
} | null): boolean {
  if (!agent?.tools?.length) return false;
  const row = agent.tools.find((t) => t.toolId === 'webhook');
  const cfg = row?.config && typeof row.config === 'object' && row.config !== null ? row.config : null;
  const url = cfg && 'url' in cfg ? String((cfg as Record<string, unknown>).url ?? '').trim() : '';
  return url.length > 0;
}

export type DirectMcpWidgetChatResult = {
  reply: string;
  toolsUsed?: string[];
  toolRounds?: number;
};

/**
 * Intenta responder vía MCP del hub (ejecución real de webhook). Devuelve null si no aplica o falla.
 * `ownerUserId` limita el lookup al agente del widget (evita agentId arbitrario en el body).
 */
export async function tryServeWidgetChatViaHubMcp(params: {
  widgetTokenStartsWithWt: boolean;
  parsedAgentId: string;
  rawBody: string;
  ownerUserId: string;
}): Promise<DirectMcpWidgetChatResult | null> {
  if (!params.widgetTokenStartsWithWt || !params.parsedAgentId.trim()) return null;
  const hubBase = getAibackhubBaseUrl();
  if (!hubBase) return null;

  let parsed: {
    message?: string;
    history?: Array<{ role: string; content: string }>;
    agentId?: string;
  };
  try {
    parsed = JSON.parse(params.rawBody) as typeof parsed;
  } catch {
    return null;
  }

  const message = typeof parsed.message === 'string' ? parsed.message : '';
  if (!message.trim()) return null;

  await connectDB();
  const id = params.parsedAgentId.trim();
  const orClause: Array<Record<string, unknown>> = [];
  if (/^[a-f0-9]{24}$/i.test(id)) {
    orClause.push({ _id: id });
  }
  orClause.push({ agentHubId: id });

  const ca = await ClientAgent.findOne({
    $and: [
      { $or: orClause },
      { $or: [{ userId: params.ownerUserId }, { isPlatform: true }] },
    ],
  }).lean();
  if (!ca || !clientAgentHasWebhookUrl(ca)) return null;

  const hubId = typeof ca.agentHubId === 'string' ? ca.agentHubId.trim() : '';
  if (hubId) {
    await syncHubCatalogFromLandingAgentDoc(
      ca as Parameters<typeof syncHubCatalogFromLandingAgentDoc>[0],
    );
  }

  const payload = {
    agentId: typeof parsed.agentId === 'string' && parsed.agentId.trim() ? parsed.agentId.trim() : id,
    message,
    history: Array.isArray(parsed.history)
      ? parsed.history.filter(
          (h): h is { role: 'user' | 'model'; content: string } =>
            Boolean(h) &&
            typeof h === 'object' &&
            (h.role === 'user' || h.role === 'model') &&
            typeof h.content === 'string',
        )
      : [],
    model: (typeof ca.model === 'string' && ca.model.trim()) ? ca.model.trim() : 'gemini-2.5-flash',
    systemPrompt: typeof ca.systemPrompt === 'string' ? ca.systemPrompt : '',
    enabledToolIds: Array.isArray(ca.enabledMcpToolIds) ? ca.enabledMcpToolIds : [],
    replyProvider: 'google-ai',
    ...(typeof ca.inferenceTemperature === 'number' ? { temperature: ca.inferenceTemperature } : {}),
    ...(typeof ca.inferenceMaxTokens === 'number' ? { maxTokens: ca.inferenceMaxTokens } : {}),
  };

  const url = `${hubBase.replace(/\/$/, '')}/api/mcp/widget-chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...hubCreateHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });

  const rawText = await res.text();
  if (!res.ok) {
    console.warn('[widget-chat-direct-mcp] hub MCP failed', res.status, rawText.slice(0, 400));
    return null;
  }

  let json: {
    success?: boolean;
    data?: { text?: string; toolsUsed?: string[]; toolRounds?: number };
  };
  try {
    json = JSON.parse(rawText) as typeof json;
  } catch {
    return null;
  }

  const data = json?.data;
  if (!data || typeof data.text !== 'string') return null;

  return {
    reply: data.text,
    toolsUsed: data.toolsUsed,
    toolRounds: data.toolRounds,
  };
}
