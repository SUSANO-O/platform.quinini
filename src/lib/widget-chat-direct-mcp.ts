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
import { agentSkillsNeedMcpTools } from '@/lib/agent-skills-mcp';
import { logWidgetFlow, widgetMessageProbe } from '@/lib/debug-widget-flow';
import { agentHasAnyWebhook } from '@/lib/agent-webhooks';
import { agentHasAnySheet } from '@/lib/agent-sheets';
import { isTrivialMessage } from '@/lib/trivial-message';
import {
  buildUserPromptWithSessionContext,
  buildVisionSessionBlock,
  finalizeWidgetChatBodyWithVision,
  VISION_SYSTEM_INSTRUCTIONS,
} from '@/lib/widget-chat-vision-context';
import type { WidgetImageEnrichment } from '@/lib/widget-chat-images';

export function clientAgentHasWebhookUrl(agent: {
  tools?: Array<{ toolId?: string; config?: unknown }>;
} | null): boolean {
  return agentHasAnyWebhook(agent) || agentHasAnySheet(agent);
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
  /** Última defensa: fusionar OCR/visión justo antes del POST a AIBackHub. */
  visionEnrichment?: WidgetImageEnrichment | null;
  strictPurposeSuffix?: string;
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

  let rawBody = params.rawBody;
  if (params.visionEnrichment?.analyses?.length) {
    try {
      rawBody = await finalizeWidgetChatBodyWithVision({
        rawBody,
        enrichment: params.visionEnrichment,
        agentId: params.parsedAgentId,
        ownerUserId: params.ownerUserId,
        strictPurposeSuffix: params.strictPurposeSuffix,
        force: true,
      });
      logWidgetFlow('👁️', 'direct:vision', 'contexto OCR/visión aplicado antes de MCP', {
        agentId: params.parsedAgentId,
      });
    } catch (visionErr) {
      logWidgetFlow('⚠️', 'direct:visionErr', visionErr instanceof Error ? visionErr.message : String(visionErr));
    }
  }

  let parsed: {
    message?: string;
    history?: Array<{ role: string; content: string }>;
    agentId?: string;
    sessionId?: string;
    sessionContextBlock?: string;
    systemPromptOverride?: string;
    visitorEmail?: string;
    visitorName?: string;
    visitorUserId?: string;
  };
  try {
    parsed = JSON.parse(rawBody) as typeof parsed;
  } catch {
    return null;
  }

  const message = typeof parsed.message === 'string' ? parsed.message : '';
  if (!message.trim()) {
    logWidgetFlow('🚫', 'direct:skip', 'mensaje vacío');
    return null;
  }

  let sessionBlock =
    typeof parsed.sessionContextBlock === 'string' ? parsed.sessionContextBlock.trim() : '';
  if (
    params.visionEnrichment?.analyses?.length &&
    (!sessionBlock || !sessionBlock.includes('Contenido detectado'))
  ) {
    sessionBlock = sessionBlock
      ? `${buildVisionSessionBlock(params.visionEnrichment)}\n\n---\n\n${sessionBlock}`
      : buildVisionSessionBlock(params.visionEnrichment);
  }

  const promptForModel = buildUserPromptWithSessionContext(message.trim(), sessionBlock);

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
  const skillsNeedMcp = Boolean(ca && agentSkillsNeedMcpTools(ca));
  const hasExplicitMcpIds = Array.isArray(ca?.enabledMcpToolIds)
    ? ca.enabledMcpToolIds.some(
        (t: unknown) => typeof t === 'string' && (t.startsWith('mcp:') || t.startsWith('std:')),
      )
    : false;
  const eligible =
    Boolean(ca) &&
    (clientAgentHasWebhookUrl(ca) ||
      clientAgentWantsHubspotWidgetAutoCapture(ca) ||
      skillsNeedMcp ||
      hasExplicitMcpIds);
  if (!ca || !eligible) {
    logWidgetFlow('🚫', 'direct:skip', 'agente sin webhook/HubSpot/skills-MCP/tools explícitas', {
      agentId: id,
      foundAgent: Boolean(ca),
      skillsNeedMcp,
      hasExplicitMcpIds,
    });
    return null;
  }

  // Saludos: no pagar pipeline MCP; el caller puede usar /api/models barato.
  if (
    (skillsNeedMcp || hasExplicitMcpIds) &&
    !clientAgentHasWebhookUrl(ca) &&
    !clientAgentWantsHubspotWidgetAutoCapture(ca) &&
    isTrivialMessage(message, Array.isArray(parsed.history) ? parsed.history : undefined)
  ) {
    logWidgetFlow('⚡', 'direct:skip', 'mensaje trivial — omitir MCP (fast-path models)', {
      agentId: id,
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

  const resolvedModel = (typeof ca.model === 'string' && ca.model.trim()) ? ca.model.trim() : 'gemini-2.5-flash';
  // Inferir provider desde prefijo del modelo para ser agnóstico al modelo configurado
  function inferReplyProvider(model: string): string {
    const m = model.toLowerCase();
    if (m.startsWith('claude') || m.startsWith('anthropic/')) return 'anthropic';
    if (m.startsWith('hf/')) return 'huggingface';
    if (m.startsWith('vx/')) return 'vertex';
    if (m.startsWith('deepseek')) return 'deepseek';
    return 'vertex';
  }

  const bodySystemOverride =
    typeof parsed.systemPromptOverride === 'string' ? parsed.systemPromptOverride.trim() : '';
  let resolvedSystemPrompt =
    bodySystemOverride || (typeof ca.systemPrompt === 'string' ? ca.systemPrompt : '');
  if (
    params.visionEnrichment?.analyses?.length &&
    !resolvedSystemPrompt.includes('[CAPACIDAD DE VISIÓN')
  ) {
    const visionBlock = buildVisionSessionBlock(params.visionEnrichment);
    resolvedSystemPrompt = `${resolvedSystemPrompt.trim()}\n\n${VISION_SYSTEM_INSTRUCTIONS}\n\n${visionBlock}`.trim();
  }

  const visitorEmail =
    typeof parsed.visitorEmail === 'string' ? parsed.visitorEmail.trim().toLowerCase() : '';
  const visitorName = typeof parsed.visitorName === 'string' ? parsed.visitorName.trim() : '';
  const sessionContextBlock =
    typeof parsed.sessionContextBlock === 'string' ? parsed.sessionContextBlock.trim() : '';
  const chatSessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId.trim() : '';
  const visitorUserId =
    typeof parsed.visitorUserId === 'string' ? parsed.visitorUserId.trim() : '';

  const payload = {
    agentId: typeof parsed.agentId === 'string' && parsed.agentId.trim() ? parsed.agentId.trim() : id,
    message: promptForModel,
    history: Array.isArray(parsed.history)
      ? parsed.history
          .map((h) => {
            if (!h || typeof h !== 'object') return null;
            const roleRaw = String((h as { role?: unknown }).role || '');
            const role =
              roleRaw === 'user' ? 'user' : roleRaw === 'model' || roleRaw === 'assistant' ? 'model' : '';
            const content = (h as { content?: unknown }).content;
            if (!role || typeof content !== 'string') return null;
            return { role: role as 'user' | 'model', content };
          })
          .filter((h): h is { role: 'user' | 'model'; content: string } => Boolean(h))
      : [],
    model: resolvedModel,
    systemPrompt: resolvedSystemPrompt,
    enabledToolIds: Array.isArray(ca.enabledMcpToolIds) ? ca.enabledMcpToolIds : [],
    replyProvider: inferReplyProvider(resolvedModel),
    ...(typeof ca.inferenceTemperature === 'number' ? { temperature: ca.inferenceTemperature } : {}),
    ...(typeof ca.inferenceMaxTokens === 'number' ? { maxTokens: ca.inferenceMaxTokens } : {}),
    hubspotAutoCaptureContacts:
      ca.hubspotAutoCaptureContacts === true || Boolean(visitorEmail && visitorName),
    ...(visitorEmail ? { visitorEmail } : {}),
    ...(visitorName ? { visitorName } : {}),
    ...(sessionContextBlock ? { sessionContextBlock } : {}),
    ...(chatSessionId ? { sessionId: chatSessionId } : {}),
    ...(visitorUserId ? { visitorUserId } : {}),
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
