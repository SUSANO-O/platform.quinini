/**
 * Fases y mensajes de estado SSE para /api/widget/chat/stream.
 * El widget muestra estos textos en la tarjeta de pensamiento (Fase 1).
 */

import { agentSkillsNeedMcpTools } from '@/lib/agent-skills-mcp';
import { isNumericReasoningTurn, needsKnowledgeLookup } from '@/lib/widget-counter-rhythm';

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

/** Re-exportado para tests E2E y scripts. Intervalo más largo = menos titileo. */
export const WIDGET_STATUS_PULSE_MS = 1800;

/** Solo fases de espera real: el resto emite un status y no rota copy. */
export const PULSE_ELIGIBLE_PHASES: ReadonlySet<WidgetChatStatusPhase> = new Set([
  'hub',
  'tools',
  'mcp',
  'triage',
  'parallel',
  'pipeline',
  'handoff',
]);

export function shouldPulseStatusPhase(phase: WidgetChatStatusPhase): boolean {
  return PULSE_ELIGIBLE_PHASES.has(phase);
}

const PHASE_TICK_LINES: Partial<Record<WidgetChatStatusPhase, string[]>> = {
  prepare: ['Organizando tu mensaje…', 'Un momento…'],
  enrich: ['Revisando lo que ya hablamos…', 'Ordenando el hilo…'],
  validate: ['Confirmando la sesión…'],
  resolve: ['Conectando con tu asistente…'],
  hub: ['Pensando la respuesta…', 'Procesando tu mensaje…', 'Ya casi…'],
  model: ['Redactando…', 'Afinando la respuesta…', 'Casi listo…'],
  rag: ['Buscando en la base de conocimiento…', 'Revisando documentos…'],
  tools: ['Consultando datos…', 'Un segundo más…'],
  mcp: ['Consultando integraciones…', 'Recuperando información…'],
  triage: ['Viendo cómo ayudarte mejor…', 'Un momento…'],
};

const INVENTORY_TURN_RE = /\binventario\b/i;

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

/** Mensaje de status según fase y el texto del visitante (catálogo vs cálculo). */
export function widgetChatStatusForUserMessage(
  userMessage: string,
  phase: WidgetChatStatusPhase,
  detail?: string,
  history?: Array<{ role?: string; content?: string } | null> | null,
): string {
  const msg = typeof userMessage === 'string' ? userMessage.trim() : '';
  if (msg) {
    if (phase === 'rag' || phase === 'hub' || phase === 'mcp' || phase === 'tools') {
      if (isNumericReasoningTurn(msg, history)) {
        return 'Calculando con las cifras ya conocidas…';
      }
      if (needsKnowledgeLookup(msg) && INVENTORY_TURN_RE.test(msg)) {
        return 'Consultando catálogo y precios…';
      }
      if (needsKnowledgeLookup(msg)) {
        return 'Consultando precios y fichas…';
      }
    }
    if (phase === 'model' && isNumericReasoningTurn(msg, history)) {
      return 'Razonando con las cifras del hilo…';
    }
  }
  return widgetChatStatusMessage(phase, detail);
}

/** Rota el copy de la tarjeta de pensamiento si la fase no cambia. */
export function widgetChatStatusTick(
  phase: WidgetChatStatusPhase,
  elapsedMs: number,
  detail?: string,
  serverMessage?: string,
): string {
  const base = (typeof serverMessage === 'string' && serverMessage.trim())
    ? serverMessage.trim()
    : widgetChatStatusMessage(phase, detail);
  const extras = PHASE_TICK_LINES[phase] ?? [];
  const lines = [base];
  for (const extra of extras) {
    if (extra && extra !== base) lines.push(extra);
  }
  const step = Math.max(0, Math.floor(elapsedMs / WIDGET_STATUS_PULSE_MS));
  return lines[step % lines.length];
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

export function emitWidgetChatStatusForTurn(
  enqueue: (data: Record<string, unknown>) => void,
  userMessage: string,
  phase: WidgetChatStatusPhase,
  detail?: string,
): void {
  enqueue({
    type: 'status',
    phase,
    message: widgetChatStatusForUserMessage(userMessage, phase, detail),
  });
}

/** Mantiene el indicador vivo solo en fases largas (hub/tools/mcp…). */
export async function runWithWidgetStatusPulse<T>(
  enqueue: (data: Record<string, unknown>) => void,
  userMessage: string,
  phase: WidgetChatStatusPhase,
  work: () => Promise<T>,
  detail?: string,
): Promise<T> {
  const initialMsg = widgetChatStatusForUserMessage(userMessage, phase, detail);
  emitWidgetChatStatusForTurn(enqueue, userMessage, phase, detail);

  if (!shouldPulseStatusPhase(phase)) {
    return work();
  }

  const startedAt = Date.now();
  let lastMessage = initialMsg;
  const timer = setInterval(() => {
    const next = widgetChatStatusTick(
      phase,
      Date.now() - startedAt,
      detail,
      widgetChatStatusForUserMessage(userMessage, phase, detail),
    );
    if (next === lastMessage) return;
    lastMessage = next;
    enqueue({
      type: 'status',
      phase,
      message: next,
    });
  }, WIDGET_STATUS_PULSE_MS);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
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
