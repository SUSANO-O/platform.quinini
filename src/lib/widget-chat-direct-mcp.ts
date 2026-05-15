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
import { logWidgetFlow, widgetMessageProbe } from '@/lib/debug-widget-flow';

export function clientAgentHasWebhookUrl(agent: {
  tools?: Array<{ toolId?: string; config?: unknown }>;
} | null): boolean {
  if (!agent?.tools?.length) return false;
  const row = agent.tools.find((t) => t.toolId === 'webhook');
  const cfg = row?.config && typeof row.config === 'object' && row.config !== null ? row.config : null;
  const url = cfg && 'url' in cfg ? String((cfg as Record<string, unknown>).url ?? '').trim() : '';
  return url.length > 0;
}

const HUBSPOT_WIDGET_AUTO_TOOL_IDS = [
  'mcp:hubspot:hubspot_search_contacts',
  'mcp:hubspot:hubspot_create_contact',
] as const;

function clientAgentWantsHubspotWidgetAutoCapture(ca: {
  hubspotAutoCaptureContacts?: boolean;
  enabledMcpToolIds?: string[];
}): boolean {
  if (ca.hubspotAutoCaptureContacts !== true) return false;
  const ids = ca.enabledMcpToolIds ?? [];
  return HUBSPOT_WIDGET_AUTO_TOOL_IDS.every((id) => ids.includes(id));
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
  if (!params.widgetTokenStartsWithWt || !params.parsedAgentId.trim()) {
    logWidgetFlow('🚫', 'direct:skip', 'sin wt_ o agentId', { agentId: params.parsedAgentId });
    return null;
  }
  const hubBase = getAibackhubBaseUrl();
  if (!hubBase) {
    logWidgetFlow('🚫', 'direct:skip', 'BACKEND_URL / AIBackHub vacío');
    return null;
  }

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
  if (!message.trim()) {
    logWidgetFlow('🚫', 'direct:skip', 'mensaje vacío');
    return null;
  }

  await connectDB();
  const id = params.parsedAgentId.trim();
  logWidgetFlow('🧲', 'direct:start', 'POST /api/mcp/widget-chat en AIBackHub', {
    agentId: id,
    hubBase,
    ...widgetMessageProbe(message),
  });

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
  if (!ca || (!clientAgentHasWebhookUrl(ca) && !clientAgentWantsHubspotWidgetAutoCapture(ca))) {
    logWidgetFlow('🚫', 'direct:skip', 'agente sin webhook URL ni captura HubSpot auto con tools requeridas', {
      agentId: id,
      foundAgent: Boolean(ca),
    });
    return null;
  }

  // Modelos de imagen (hf/...stable-diffusion, hf/...flux, vx/...image, etc.) deben ir
  // por el proxy estándar de AgentFlowhub que tiene la lógica text-to-image.
  // Este endpoint MCP solo hace chat de texto (replyProvider: google-ai).
  const agentModel = typeof ca.model === 'string' ? ca.model.trim().toLowerCase() : '';
  const isImageModel =
    (agentModel.startsWith('hf/') && (agentModel.includes('stable-diffusion') || agentModel.includes('flux') || agentModel.includes('image-gen'))) ||
    (agentModel.startsWith('vx/') && (agentModel.includes('image') || agentModel.includes('nano-banana')));
  if (isImageModel) {
    logWidgetFlow('🖼️', 'direct:skip', 'modelo de imagen — delegando al proxy AgentFlowhub para text-to-image', {
      agentId: id,
      model: agentModel,
    });
    return null;
  }

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
    hubspotAutoCaptureContacts: ca.hubspotAutoCaptureContacts === true,
  };

  const url = `${hubBase.replace(/\/$/, '')}/api/mcp/widget-chat`;
  logWidgetFlow('📡', 'direct:fetch', 'llamando hub MCP', { url, enabledToolCount: payload.enabledToolIds.length });
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...hubCreateHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });

  const rawText = await res.text();
  if (!res.ok) {
    logWidgetFlow('❌', 'direct:hubHttp', 'AIBackHub respondió error', {
      status: res.status,
      bodyHead: rawText.slice(0, 200),
    });
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
    logWidgetFlow('❌', 'direct:parse', 'respuesta no es JSON', { bodyHead: rawText.slice(0, 120) });
    return null;
  }

  const data = json?.data;
  if (!data || typeof data.text !== 'string') {
    logWidgetFlow('❌', 'direct:parse', 'JSON sin data.text', { success: json?.success });
    return null;
  }

  logWidgetFlow('✅', 'direct:ok', 'respuesta MCP', {
    replyLen: data.text.length,
    toolsUsed: data.toolsUsed ?? [],
    toolRounds: data.toolRounds,
  });

  return {
    reply: data.text,
    toolsUsed: data.toolsUsed,
    toolRounds: data.toolRounds,
  };
}
