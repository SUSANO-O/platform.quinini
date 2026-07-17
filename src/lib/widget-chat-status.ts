/**
 * Fases y mensajes de estado SSE para /api/widget/chat/stream.
 * El widget muestra estos textos en la tarjeta de pensamiento (Fase 1+2).
 */

import { agentSkillsNeedMcpTools } from '@/lib/agent-skills-mcp';

export type WidgetChatStatusPhase =
  | 'prepare'
  | 'validate'
  | 'vision'
  | 'enrich'
  | 'resolve'
  | 'triage'
  | 'handoff'
  | 'parallel'
  | 'pipeline'
  | 'content'
  | 'creative'
  | 'synthesize'
  | 'skills'
  | 'rag'
  | 'tools'
  | 'mcp'
  | 'model'
  | 'hub'
  | 'start';

export function widgetChatStatusMessage(
  phase: WidgetChatStatusPhase,
  detail?: string,
): string {
  const d = typeof detail === 'string' ? detail.trim() : '';
  switch (phase) {
    case 'prepare':
      return 'Preparando tu solicitud…';
    case 'validate':
      return 'Verificando sesión…';
    case 'vision':
      return 'Analizando captura…';
    case 'enrich':
      return 'Cargando contexto de conversación…';
    case 'resolve':
      return 'Identificando agente…';
    case 'skills':
      return d ? `Aplicando habilidad: ${d}…` : 'Aplicando habilidades del agente…';
    case 'rag':
      return 'Consultando documentos indexados…';
    case 'tools':
      return d ? `Usando ${d}…` : 'Ejecutando herramientas…';
    case 'mcp':
      return 'Conectando con integraciones…';
    case 'model':
      return d ? `Generando respuesta…` : 'Generando respuesta…';
    case 'hub':
      return 'Consultando al asistente…';
    case 'triage':
      return 'Analizando tu consulta…';
    case 'handoff':
      return d ? `Conectando con ${d}…` : 'Derivando a un especialista…';
    case 'parallel':
      return 'Consultando especialistas en paralelo…';
    case 'pipeline':
      return 'Recopilando información…';
    case 'content':
      return 'Recopilando información del producto…';
    case 'creative':
      return d ? `Generando creativo con ${d}…` : 'Generando creativo…';
    case 'synthesize':
      return 'Preparando respuesta unificada…';
    case 'start':
    default:
      return 'Generando respuesta…';
  }
}

export type WidgetChatStreamHints = {
  hasSkills: boolean;
  skillCount: number;
  ragEnabled: boolean;
  hasMcpTools: boolean;
  hasWebhookTools: boolean;
};

export function hintsFromAgentDoc(doc: {
  skills?: string[];
  skillsConfig?: Array<{
    id?: string;
    enabled?: boolean;
    config?: { active_tools?: string[] };
  }>;
  ragEnabled?: boolean;
  enabledMcpToolIds?: string[];
  tools?: Array<{ toolId?: string }>;
} | null): WidgetChatStreamHints {
  if (!doc) {
    return {
      hasSkills: false,
      skillCount: 0,
      ragEnabled: false,
      hasMcpTools: false,
      hasWebhookTools: false,
    };
  }

  const skillIds = new Set<string>();
  if (Array.isArray(doc.skills)) {
    for (const id of doc.skills) {
      if (typeof id === 'string' && id.trim()) skillIds.add(id.trim());
    }
  }
  if (Array.isArray(doc.skillsConfig)) {
    for (const row of doc.skillsConfig) {
      if (row?.enabled === false) continue;
      if (typeof row?.id === 'string' && row.id.trim()) skillIds.add(row.id.trim());
    }
  }

  const mcpIds = Array.isArray(doc.enabledMcpToolIds) ? doc.enabledMcpToolIds : [];
  const hasExplicitMcp = mcpIds.some(
    (id) => typeof id === 'string' && (id.startsWith('mcp:') || id.startsWith('std:')),
  );
  const hasMcpTools = hasExplicitMcp || agentSkillsNeedMcpTools(doc);
  const toolIds = (doc.tools ?? []).map((t) => t.toolId).filter(Boolean);
  const hasWebhookTools = toolIds.includes('webhook') || toolIds.some((t) => t === 'google-sheets');

  return {
    hasSkills: skillIds.size > 0,
    skillCount: skillIds.size,
    ragEnabled: doc.ragEnabled === true,
    hasMcpTools,
    hasWebhookTools,
  };
}

export function emitWidgetChatStatus(
  enqueue: (data: Record<string, unknown>) => void,
  phase: WidgetChatStatusPhase,
  detail?: string,
): void {
  enqueue({
    type: 'status',
    phase,
    message: widgetChatStatusMessage(phase, detail),
  });
}

type AgentHintsDoc = {
  skills?: string[];
  skillsConfig?: Array<{ id?: string; enabled?: boolean }>;
  ragEnabled?: boolean;
  enabledMcpToolIds?: string[];
  tools?: Array<{ toolId?: string }>;
} | null;

const HINTS_CACHE_TTL_MS = 60_000;
const hintsCache = new Map<string, { at: number; hints: WidgetChatStreamHints }>();

function hintsCacheKey(agentId: string, ownerUserId: string | null): string {
  return `${ownerUserId ?? '_'}:${agentId}`;
}

export function hintsFromCachedAgentDoc(doc: AgentHintsDoc): WidgetChatStreamHints {
  return hintsFromAgentDoc(doc);
}

/** Carga pistas del agente para emitir fases SSE (skills, RAG, MCP). */
export async function loadAgentStreamHints(
  parsedAgentId: string,
  ownerUserId: string | null,
  prefetchedDoc?: AgentHintsDoc,
): Promise<WidgetChatStreamHints> {
  if (prefetchedDoc !== undefined) {
    return hintsFromAgentDoc(prefetchedDoc);
  }

  if (!parsedAgentId.trim()) return hintsFromAgentDoc(null);

  const cacheKey = hintsCacheKey(parsedAgentId.trim(), ownerUserId);
  const cached = hintsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < HINTS_CACHE_TTL_MS) {
    return cached.hints;
  }

  const { connectDB } = await import('@/lib/db/connection');
  const { ClientAgent } = await import('@/lib/db/models');
  const { Types } = await import('mongoose');

  await connectDB();
  const id = parsedAgentId.trim();
  const orClause: Array<Record<string, unknown>> = [];
  if (/^[a-f0-9]{24}$/i.test(id)) orClause.push({ _id: new Types.ObjectId(id) });
  orClause.push({ agentHubId: id });

  const filter: Record<string, unknown> = { $or: orClause };
  if (ownerUserId) {
    filter.$and = [{ $or: [{ userId: ownerUserId }, { isPlatform: true }] }];
  }

  const doc = await ClientAgent.findOne(filter)
    .select({ skills: 1, skillsConfig: 1, ragEnabled: 1, enabledMcpToolIds: 1, tools: 1 })
    .lean();

  const hints = hintsFromAgentDoc(doc as AgentHintsDoc);
  hintsCache.set(cacheKey, { at: Date.now(), hints });
  return hints;
}
