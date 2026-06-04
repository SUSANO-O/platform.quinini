/**
 * Inferencia directa vía AIBackHub POST /api/models con el modelo explícito del agente.
 * Evita fallos cuando AgentFlowhub usa VERTEX_GEMINI_MODEL / orquestador obsoleto.
 */

import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { Types } from 'mongoose';
import { getAibackhubBaseUrl, hubCreateHeaders, hubFetch } from '@/lib/aibackhub-sync';
import { logWidgetFlow, widgetMessageProbe } from '@/lib/debug-widget-flow';
import { isTrivialMessage } from '@/lib/trivial-message';

export type DirectInferenceResult = {
  reply: string;
  usedModel?: string;
};

function inferProvider(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith('vx/')) return 'vertex';
  if (m.startsWith('hf/')) return 'huggingface';
  if (m.startsWith('claude') || m.startsWith('anthropic/')) return 'anthropic';
  if (m.startsWith('deepseek')) return 'deepseek';
  return 'google-ai';
}

function normalizeModel(model: string): { provider: string; model: string } {
  const raw = model.trim();
  const provider = inferProvider(raw);
  if (raw.startsWith('vx/')) return { provider: 'vertex', model: raw.slice(3) };
  if (raw.startsWith('hf/')) return { provider: 'huggingface', model: raw.slice(3) };
  return { provider, model: raw };
}

function isImageModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    (m.startsWith('hf/') && (m.includes('stable-diffusion') || m.includes('flux') || m.includes('image-gen'))) ||
    (m.startsWith('vx/') && (m.includes('image') || m.includes('nano-banana')))
  );
}

/** Agente con MCP (Mongo, HubSpot, etc.) debe ir por /api/mcp/widget-chat, no /api/models plano. */
async function agentNeedsMcpWidgetChat(ca: {
  enabledMcpToolIds?: unknown;
  agentHubId?: unknown;
  tools?: Array<{ toolId?: string }>;
}): Promise<boolean> {
  const ids = Array.isArray(ca.enabledMcpToolIds) ? ca.enabledMcpToolIds : [];
  if (
    ids.some(
      (id) => typeof id === 'string' && (id.startsWith('mcp:') || id.startsWith('std:')),
    )
  ) {
    return true;
  }
  if (ca.tools?.some((t) => t.toolId === 'webhook')) return true;

  const hubId = typeof ca.agentHubId === 'string' ? ca.agentHubId.trim() : '';
  if (!hubId) return false;

  const landingUri = process.env.MONGODB_URI?.trim();
  if (!landingUri) return false;
  const hubUri =
    process.env.AIBACKHUB_MONGO_URI?.trim() ||
    process.env.HUB_MONGODB_URI?.trim() ||
    landingUri.replace(/agentflowhub_landing/i, 'agentflow');

  try {
    const { createConnection } = await import('mongoose');
    const conn = await createConnection(hubUri).asPromise();
    try {
      const db = conn.db;
      if (!db) return false;
      const n = await db.collection('mcp_connections').countDocuments({
        agentId: hubId,
        syncStatus: 'ok',
      });
      return n > 0;
    } finally {
      await conn.close();
    }
  } catch {
    return false;
  }
}

function extractReply(json: Record<string, unknown>): string {
  const data = json.data && typeof json.data === 'object' ? (json.data as Record<string, unknown>) : null;
  for (const v of [json.reply, json.text, json.response, data?.text, data?.reply, data?.response]) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export async function tryServeWidgetChatViaDirectInference(params: {
  parsedAgentId: string;
  rawBody: string;
  ownerUserId: string;
  agentHubId?: string;
}): Promise<DirectInferenceResult | null> {
  if (!getAibackhubBaseUrl() || !params.parsedAgentId.trim()) return null;

  let parsed: {
    message?: string;
    history?: Array<{ role: string; content: string }>;
  };
  try {
    parsed = JSON.parse(params.rawBody) as typeof parsed;
  } catch {
    return null;
  }

  const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
  if (!message) return null;

  await connectDB();
  const id = params.parsedAgentId.trim();
  const orClause: Array<Record<string, unknown>> = [];
  if (/^[a-f0-9]{24}$/i.test(id)) orClause.push({ _id: new Types.ObjectId(id) });
  orClause.push({ agentHubId: id });
  if (params.agentHubId?.trim()) orClause.push({ agentHubId: params.agentHubId.trim() });

  const ca = await ClientAgent.findOne({
    $and: [{ $or: orClause }, { $or: [{ userId: params.ownerUserId }, { isPlatform: true }] }],
  }).lean();
  if (!ca) {
    logWidgetFlow('🚫', 'infer:skip', 'agente no encontrado', { agentId: id });
    return null;
  }

  const storedModel =
    (typeof ca.model === 'string' && ca.model.trim()) || 'vx/gemini-2.5-flash';
  if (isImageModel(storedModel)) return null;

  if (await agentNeedsMcpWidgetChat(ca)) {
    logWidgetFlow('⏭️', 'infer:skip', 'agente con MCP — requiere /api/mcp/widget-chat vía hub', {
      agentId: id,
      agentHubId: ca.agentHubId,
    });
    return null;
  }

  const { provider, model } = normalizeModel(storedModel);

  // Fast-path: saludos / cortesías triviales → forzar el modelo más barato
  // (gemini-2.5-flash-lite), sin importar el modelo configurado del agente.
  const trivial = isTrivialMessage(message, parsed.history);
  const effProvider = trivial ? 'google-ai' : provider;
  const effModel = trivial ? 'gemini-2.5-flash-lite' : model;

  logWidgetFlow(trivial ? '⚡' : '🧠', 'infer:start', 'POST /api/models directo', {
    agentId: id,
    provider: effProvider,
    model: effModel,
    fastPath: trivial,
    ...widgetMessageProbe(message),
  });

  const history = Array.isArray(parsed.history)
    ? parsed.history
        .filter(
          (h): h is { role: 'user' | 'model'; content: string } =>
            Boolean(h) &&
            typeof h === 'object' &&
            (h.role === 'user' || h.role === 'model') &&
            typeof h.content === 'string',
        )
        .map((h) => ({ role: h.role, content: h.content }))
    : undefined;

  const agentName =
    (typeof ca.agentHubId === 'string' && ca.agentHubId.trim()) ||
    (typeof ca.name === 'string' ? ca.name : 'widget-agent');

  try {
    const res = await hubFetch(
      '/api/models',
      {
        method: 'POST',
        headers: {
          ...hubCreateHeaders(),
          'x-agent-name': agentName,
        },
        body: JSON.stringify({
          prompt: message,
          systemPrompt: typeof ca.systemPrompt === 'string' ? ca.systemPrompt : '',
          provider: effProvider,
          model: effModel,
          taskType: 'chat',
          history,
          ...(typeof ca.inferenceTemperature === 'number' ? { temperature: ca.inferenceTemperature } : {}),
          ...(typeof ca.inferenceMaxTokens === 'number' ? { maxTokens: ca.inferenceMaxTokens } : {}),
        }),
      },
      120_000,
    );

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      logWidgetFlow('❌', 'infer:http', 'AIBackHub /api/models error', {
        status: res.status,
        error: typeof json.error === 'string' ? json.error : undefined,
      });
      return null;
    }

    const reply = extractReply(json);
    if (!reply) {
      logWidgetFlow('❌', 'infer:empty', 'respuesta vacía');
      return null;
    }

    const dataObj = json.data && typeof json.data === 'object' ? (json.data as Record<string, unknown>) : undefined;
    const usedModel =
      typeof json.modelUsed === 'string'
        ? json.modelUsed
        : typeof dataObj?.modelUsed === 'string'
          ? dataObj.modelUsed
          : storedModel;

    logWidgetFlow('✅', 'infer:ok', 'respuesta directa', { replyLen: reply.length, usedModel });
    return { reply, usedModel };
  } catch (err) {
    logWidgetFlow('❌', 'infer:err', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** True si la respuesta del hub indica modelo obsoleto u otro fallo recuperable. */
export function hubResponseNeedsDirectInference(status: number, bodyText: string): boolean {
  if (status >= 200 && status < 300) return false;
  const lower = bodyText.toLowerCase();
  return (
    lower.includes('flash-lite-preview') ||
    lower.includes('no longer available') ||
    lower.includes('widget_chat_failed') ||
    status === 502 ||
    status === 503
  );
}
