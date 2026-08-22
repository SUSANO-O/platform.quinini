/**
 * Inferencia directa vía AIBackHub POST /api/models con el modelo explícito del agente.
 * Evita fallos cuando AgentFlowhub usa VERTEX_GEMINI_MODEL / orquestador obsoleto.
 */

import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { Types } from 'mongoose';
import { getAibackhubBaseUrl, hubCreateHeaders, hubFetch } from '@/lib/aibackhub-sync';
import { agentSkillsNeedMcpTools } from '@/lib/agent-skills-mcp';
import { logWidgetFlow, widgetMessageProbe } from '@/lib/debug-widget-flow';
import { isTrivialMessage } from '@/lib/trivial-message';
import {
  LEAD_CAPTURE_SKILL_IDS,
  leadCaptureToolsAllowed,
  needsKnowledgeLookup,
  shouldSkipHeavyWidgetPath,
  shouldUseCheapGreetingModel,
  widgetReplyMaxTokens,
  widgetRuntimeDirectives,
} from '@/lib/widget-counter-rhythm';
import { buildUserPromptWithSessionContext, VISION_SYSTEM_INSTRUCTIONS } from '@/lib/widget-chat-vision-context';
import {
  mergeContextBlocks,
  recallConversationContextBlock,
  shouldRecallConversationMemory,
} from '@/lib/widget-conversation-recall';
import { retrieveRagContextBlock } from '@/lib/rag-embeddings-index';
import { widgetChatStatusForUserMessage } from '@/lib/widget-chat-status';

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
  return 'vertex';
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

/** Agente con MCP (Mongo, HubSpot, skills con tools, etc.) debe ir por /api/mcp/widget-chat. */
async function agentNeedsMcpWidgetChat(ca: {
  enabledMcpToolIds?: unknown;
  agentHubId?: unknown;
  tools?: Array<{ toolId?: string }>;
  skills?: string[] | null;
  skillsConfig?: Array<{
    id?: string;
    enabled?: boolean;
    config?: { active_tools?: string[] };
  }> | null;
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
  // Skills con tools: detección en memoria (sin Mongo extra).
  if (agentSkillsNeedMcpTools(ca)) return true;

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

/**
 * Regla general: si el TEXTO del modelo (ya desenvuelto del sobre HTTP por
 * extractReply) es a su vez un JSON puro con un campo `reply` de texto, esa
 * es la respuesta que el modelo quería mostrar — típico de agentes/prompts
 * que hablan en un protocolo estructurado (routers tipo
 * {"action":"...", "reply":"..."}). Sin esto, el widget muestra el JSON
 * crudo en pantalla. Mismo criterio que matias-backend/gemini-mcp-widget-chat.ts
 * (softenJsonOnlyAssistantText) — el camino de inferencia directa de Landing
 * no pasa por ese archivo, así que necesita su propia copia.
 */
export function softenJsonOnlyReply(text: string): string {
  const t = text.trim();
  if (t.length < 2) return text;
  const looksJson = t.startsWith('{') && t.endsWith('}');
  if (!looksJson) return text;
  try {
    const parsed = JSON.parse(t) as Record<string, unknown>;
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return text;
    const nestedReply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    return nestedReply || text;
  } catch {
    return text;
  }
}

export async function tryServeWidgetChatViaDirectInference(params: {
  parsedAgentId: string;
  rawBody: string;
  ownerUserId: string;
  agentHubId?: string;
  /** SSE stream: notifica fases (skills, model) al widget. */
  onStatus?: (phase: string, message: string) => void;
}): Promise<DirectInferenceResult | null> {
  if (!getAibackhubBaseUrl() || !params.parsedAgentId.trim()) return null;

  let parsed: {
    message?: string;
    history?: Array<{ role: string; content: string }>;
    sessionContextBlock?: string;
    systemPromptOverride?: string;
    sessionId?: string;
    visitorId?: string;
  };
  try {
    parsed = JSON.parse(params.rawBody) as typeof parsed;
  } catch {
    return null;
  }

  const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
  if (!message) return null;

  const chatSessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId.trim() : '';
  const visitorId = typeof parsed.visitorId === 'string' ? parsed.visitorId.trim() : '';

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

  // Fast-path de saludos: barato por /api/models aunque el agente tenga skills MCP.
  // AIBackHub también vacía tools en trivial; evitamos el pipeline MCP pesado.
  const trivial = isTrivialMessage(message, parsed.history);
  const skipHeavy = shouldSkipHeavyWidgetPath(message, parsed.history);
  const cheapGreeting = shouldUseCheapGreetingModel(message, parsed.history);

  if (!trivial && (await agentNeedsMcpWidgetChat(ca))) {
    logWidgetFlow('⏭️', 'infer:skip', 'agente con MCP/skills-tools — requiere /api/mcp/widget-chat', {
      agentId: id,
      agentHubId: ca.agentHubId,
      skillsNeedMcp: agentSkillsNeedMcpTools(ca),
    });
    return null;
  }

  const { provider, model } = normalizeModel(storedModel);

  const effProvider = cheapGreeting ? 'vertex' : provider;
  const effModel = cheapGreeting ? 'gemini-2.5-flash-lite' : model;

  logWidgetFlow(cheapGreeting ? '⚡' : skipHeavy ? '💬' : '🧠', 'infer:start', 'POST /api/models directo', {
    agentId: id,
    provider: effProvider,
    model: effModel,
    fastPath: cheapGreeting,
    skipHeavy,
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

  const bodySystemOverride =
    typeof parsed.systemPromptOverride === 'string' ? parsed.systemPromptOverride.trim() : '';
  const baseSystemPrompt =
    bodySystemOverride || (typeof ca.systemPrompt === 'string' ? ca.systemPrompt : '');
  const rawEnabledMcpToolIds = Array.isArray(ca.enabledMcpToolIds) ? ca.enabledMcpToolIds : [];
  const baseEnabledToolIds = rawEnabledMcpToolIds.filter(
    (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0,
  );
  type SkillConfigLite = { id: string; enabled?: boolean };
  const rawSkills: unknown[] = Array.isArray(ca.skills) ? ca.skills : [];
  const rawSkillsConfig: unknown[] = Array.isArray(ca.skillsConfig) ? ca.skillsConfig : [];
  const skillsConfig: SkillConfigLite[] =
    rawSkillsConfig.length > 0
      ? rawSkillsConfig
          .filter(
            (s: unknown): s is SkillConfigLite =>
              Boolean(s) &&
              typeof s === 'object' &&
              typeof (s as { id?: string }).id === 'string',
          )
          .map((s: SkillConfigLite) => ({ id: String(s.id).trim(), enabled: s.enabled }))
      : rawSkills
          .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id: string) => ({ id: id.trim(), enabled: true }));
  const skills = skillsConfig
    .filter((s) => s.enabled !== false && s.id.trim().length > 0)
    .map((s) => s.id);

  let resolvedSystemPrompt = baseSystemPrompt;
  let resolvedTemperature =
    typeof ca.inferenceTemperature === 'number' ? ca.inferenceTemperature : undefined;
  let resolvedMaxTokens =
    typeof ca.inferenceMaxTokens === 'number' ? ca.inferenceMaxTokens : undefined;

  if (!skipHeavy && (skills.length > 0 || skillsConfig.length > 0)) {
    params.onStatus?.(
      'skills',
      skills.length === 1
        ? `Aplicando habilidad: ${skills[0]}…`
        : `Aplicando ${skills.length} habilidades del agente…`,
    );
    try {
      const skillRes = await hubFetch(
        '/api/agents/resolve-skill-context',
        {
          method: 'POST',
          headers: hubCreateHeaders(),
          body: JSON.stringify({
            baseSystemPrompt,
            baseEnabledToolIds,
            baseTemperature: resolvedTemperature,
            baseMaxOutputTokens: resolvedMaxTokens,
            skillIds: skills,
            skillsConfig,
            ...(!leadCaptureToolsAllowed(message, parsed.history)
              ? { excludeSkillIds: [...LEAD_CAPTURE_SKILL_IDS] }
              : {}),
          }),
        },
        8_000,
      );
      const skillJson = (await skillRes.json().catch(() => ({}))) as {
        data?: {
          systemPrompt?: string;
          temperature?: number;
          maxOutputTokens?: number;
          appliedSkills?: Array<{ id: string }>;
        };
      };
      if (skillRes.ok && skillJson.data) {
        if (typeof skillJson.data.systemPrompt === 'string' && skillJson.data.systemPrompt.trim()) {
          resolvedSystemPrompt = skillJson.data.systemPrompt;
        }
        if (typeof skillJson.data.temperature === 'number') {
          resolvedTemperature = skillJson.data.temperature;
        }
        if (typeof skillJson.data.maxOutputTokens === 'number') {
          resolvedMaxTokens = skillJson.data.maxOutputTokens;
        }
        logWidgetFlow('🧩', 'infer:skills', 'skills aplicadas en prompt (sin MCP)', {
          applied: (skillJson.data.appliedSkills ?? []).map((s) => s.id),
        });
      }
    } catch {
      /* fallback al prompt base — no bloquear chat */
    }
  }

  if (
    bodySystemOverride.includes(VISION_SYSTEM_INSTRUCTIONS) &&
    !resolvedSystemPrompt.includes(VISION_SYSTEM_INSTRUCTIONS)
  ) {
    const visionTail = bodySystemOverride.slice(
      bodySystemOverride.indexOf(VISION_SYSTEM_INSTRUCTIONS),
    );
    resolvedSystemPrompt = resolvedSystemPrompt.trim()
      ? `${resolvedSystemPrompt.trim()}\n\n${visionTail}`
      : visionTail;
  }

  const runtimeBlock = widgetRuntimeDirectives(message, parsed.history).join('\n');
  if (runtimeBlock) {
    resolvedSystemPrompt = resolvedSystemPrompt.trim()
      ? `${resolvedSystemPrompt.trim()}\n\n${runtimeBlock}`
      : runtimeBlock;
  }

  let contextBlock =
    typeof parsed.sessionContextBlock === 'string' ? parsed.sessionContextBlock : '';

  if (shouldRecallConversationMemory({
    trivial,
    sessionId: chatSessionId,
    message,
    visitorId,
  })) {
    const memoryBlock = await recallConversationContextBlock({
      /** Mismo id con el que afterWidgetChatSuccess escribe este turno. */
      agentId: params.parsedAgentId,
      query: message,
      sessionId: chatSessionId,
      visitorId,
    });
    if (memoryBlock) {
      contextBlock = mergeContextBlocks(contextBlock, memoryBlock);
      logWidgetFlow('🧠', 'infer:recall', 'memoria conversacional recuperada', {
        chars: memoryBlock.length,
      });
    }
  }

  /** Documentos del panel: solo si el turno pide inventario, precio o ficha. */
  const hubIdForRag = typeof ca.agentHubId === 'string' ? ca.agentHubId.trim() : '';
  if (needsKnowledgeLookup(message) && ca.ragEnabled === true && hubIdForRag) {
    params.onStatus?.('rag', widgetChatStatusForUserMessage(message, 'rag'));
    const ragBlock = await retrieveRagContextBlock({
      agentHubId: hubIdForRag,
      query: message,
      sourcesFallback: Array.isArray(ca.ragSources) ? ca.ragSources : undefined,
    });
    if (ragBlock) {
      contextBlock = mergeContextBlocks(contextBlock, ragBlock);
      logWidgetFlow('📚', 'infer:rag', 'contexto de documentos recuperado', {
        chars: ragBlock.length,
      });
    }
  }

  const promptForModel = buildUserPromptWithSessionContext(message, contextBlock);
  resolvedMaxTokens = widgetReplyMaxTokens({
    message,
    history: parsed.history,
    agentMax: resolvedMaxTokens,
  });

  params.onStatus?.('model', widgetChatStatusForUserMessage(message, 'model'));

  try {
    const res = await hubFetch(
      '/api/models',
      {
        method: 'POST',
        headers: {
          ...hubCreateHeaders(),
          'x-agent-name': agentName,
          'x-widget-output-sanitize': 'true',
        },
        body: JSON.stringify({
          prompt: promptForModel,
          systemPrompt: resolvedSystemPrompt,
          provider: effProvider,
          model: effModel,
          taskType: 'chat',
          history,
          ...(typeof resolvedTemperature === 'number' ? { temperature: resolvedTemperature } : {}),
          ...(typeof resolvedMaxTokens === 'number' ? { maxTokens: resolvedMaxTokens } : {}),
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

    const reply = softenJsonOnlyReply(extractReply(json));
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
