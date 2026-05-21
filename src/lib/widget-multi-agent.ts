/**
 * Widget multi-agente — Fase 1: triaje + handoff | Fase 2: paralelo + síntesis (solo Business).
 * Orquestador = widget.agentId; equipo = subAgentIds del padre + widget.agentIds.
 */

import { ClientAgent } from '@/lib/db/models';
import {
  ensureClientAgentHubSynced,
  getAibackhubBaseUrl,
  hubCreateHeaders,
} from '@/lib/aibackhub-sync';
import { signRequest, SIGNATURE_HEADER } from '@/lib/hub-signature';

export const MULTI_AGENT_PLANS = new Set(['business', 'enterprise']);
export const MULTI_AGENT_MAX_TEAM = 5;

export type MultiAgentMode = 'triage' | 'parallel';

export type WidgetMultiAgentConfig = {
  multiAgentEnabled: boolean;
  multiAgentMode: MultiAgentMode;
  orchestratorAgentId: string;
  agentIds: string[];
};

export type TeamMember = {
  id: string;
  hubId: string | null;
  name: string;
  description: string;
  role: 'orchestrator' | 'specialist';
};

export type TriageResult = {
  target: TeamMember;
  method: 'llm' | 'keyword' | 'default';
  score?: number;
};

export function isMultiAgentPlanEligible(plan: string): boolean {
  return MULTI_AGENT_PLANS.has(plan);
}

export function normalizeAgentId(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** Id del catálogo AIBackHub (nunca el ObjectId de Mongo). */
export function resolveHubAgentId(member: TeamMember): string | null {
  const hub = member.hubId?.trim();
  return hub || null;
}

export type RoutableHubTarget = {
  hubId: string;
  target: TeamMember;
  handoff: boolean;
  handoffSkippedReason?: 'specialist_not_synced';
};

/**
 * Enruta al especialista solo si tiene hubId; si no, responde con el orquestador (evita 404 en AgentFlowhub).
 */
export function resolveRoutableHubAgentId(
  orchestrator: TeamMember,
  picked: TeamMember,
): RoutableHubTarget | null {
  const orchHub = resolveHubAgentId(orchestrator);
  if (!orchHub) return null;

  if (picked.id === orchestrator.id) {
    return { hubId: orchHub, target: orchestrator, handoff: false };
  }

  const specHub = resolveHubAgentId(picked);
  if (specHub) {
    return { hubId: specHub, target: picked, handoff: true };
  }

  return {
    hubId: orchHub,
    target: orchestrator,
    handoff: false,
    handoffSkippedReason: 'specialist_not_synced',
  };
}

async function hydrateTeamHubIds(members: TeamMember[], userId: string): Promise<TeamMember[]> {
  const hydrated: TeamMember[] = [];
  for (const member of members) {
    if (resolveHubAgentId(member)) {
      hydrated.push(member);
      continue;
    }
    const hubId = await ensureClientAgentHubSynced(member.id, userId);
    hydrated.push({ ...member, hubId: hubId ?? null });
  }
  return hydrated;
}

export async function loadWidgetTeam(
  config: WidgetMultiAgentConfig,
  userId: string,
): Promise<TeamMember[]> {
  const orchestratorId = normalizeAgentId(config.orchestratorAgentId);
  if (!orchestratorId) return [];

  const orchestrator = await ClientAgent.findOne({
    _id: orchestratorId,
    userId,
    status: 'active',
  })
    .select({ name: 1, description: 1, systemPrompt: 1, agentHubId: 1, subAgentIds: 1 })
    .lean();

  if (!orchestrator) return [];

  const teamIdSet = new Set<string>();
  const extra = (config.agentIds ?? []).map(normalizeAgentId).filter(Boolean);
  const subIds = (orchestrator.subAgentIds ?? []).map(String).filter(Boolean);
  for (const id of [...subIds, ...extra]) {
    if (id !== orchestratorId) teamIdSet.add(id);
  }

  const specialistIds = [...teamIdSet].slice(0, MULTI_AGENT_MAX_TEAM);
  const specialists = specialistIds.length
    ? await ClientAgent.find({
        _id: { $in: specialistIds },
        userId,
        status: 'active',
      })
        .select({ name: 1, description: 1, systemPrompt: 1, agentHubId: 1 })
        .lean()
    : [];

  const members: TeamMember[] = [
    {
      id: orchestratorId,
      hubId: orchestrator.agentHubId ? String(orchestrator.agentHubId) : null,
      name: orchestrator.name ?? 'Orquestador',
      description: (orchestrator.description ?? '').trim(),
      role: 'orchestrator',
    },
  ];

  for (const s of specialists) {
    members.push({
      id: String(s._id),
      hubId: s.agentHubId ? String(s.agentHubId) : null,
      name: s.name ?? 'Especialista',
      description: (s.description ?? '').trim(),
      role: 'specialist',
    });
  }

  return hydrateTeamHubIds(members, userId);
}

function keywordScore(message: string, member: TeamMember): number {
  const text = `${member.name} ${member.description}`.toLowerCase();
  const msg = message.toLowerCase();
  let score = 0;
  const tokens = text.split(/[\s,.;:/\-–—]+/).filter((t) => t.length > 3);
  for (const token of tokens) {
    if (msg.includes(token)) score += 2;
  }
  const buckets: Array<{ keys: string[]; weight: number }> = [
    { keys: ['venta', 'precio', 'comprar', 'plan', 'cotiz', 'pago', 'factur'], weight: 8 },
    { keys: ['soporte', 'error', 'problema', 'ayuda', 'ticket', 'bug'], weight: 8 },
    { keys: ['billing', 'cobro', 'suscri', 'renov', 'reembolso', 'invoice'], weight: 10 },
  ];
  for (const bucket of buckets) {
    if (bucket.keys.some((k) => msg.includes(k))) {
      if (bucket.keys.some((k) => text.includes(k))) score += bucket.weight;
    }
  }
  if (member.role === 'orchestrator') score += 1;
  return score;
}

export function triageByKeywords(message: string, team: TeamMember[]): TriageResult {
  if (team.length <= 1) {
    return { target: team[0], method: 'default' };
  }
  let best = team[0];
  let bestScore = -1;
  for (const member of team) {
    const score = keywordScore(message, member);
    if (score > bestScore) {
      bestScore = score;
      best = member;
    }
  }
  if (bestScore <= 1) {
    const msgLower = message.toLowerCase();
    const billingKeys = ['reembolso', 'cobro', 'suscri', 'factur', 'billing', 'invoice', 'devolu', 'cancelar'];
    if (billingKeys.some((k) => msgLower.includes(k))) {
      const billingSpec = team.find(
        (m) =>
          m.role === 'specialist' &&
          /financ|billing|cobro|reembolso|factur|peritaje|closer|soporte/i.test(
            `${m.name} ${m.description}`,
          ),
      );
      if (billingSpec) {
        return { target: billingSpec, method: 'keyword', score: 12 };
      }
    }
    return { target: team[0], method: 'default' };
  }
  return { target: best, method: 'keyword', score: bestScore };
}

async function triageByLlm(message: string, team: TeamMember[]): Promise<TriageResult | null> {
  const hubBase = getAibackhubBaseUrl();
  if (!hubBase || team.length <= 1) return null;

  const roster = team
    .map((m) => `- id="${m.id}" name="${m.name}" role=${m.role}: ${m.description || 'sin descripción'}`)
    .join('\n');

  const prompt = [
    'Eres un router de triaje para un widget de chat.',
    'Elige UN solo agentId de la lista que mejor atienda el mensaje del usuario.',
    'Responde SOLO JSON válido: {"agentId":"..."}',
    'Si no hay match claro, usa el agente con role=orchestrator.',
    '',
    'Agentes:',
    roster,
    '',
    `Mensaje del usuario: ${message.slice(0, 1500)}`,
  ].join('\n');

  try {
    const res = await fetch(`${hubBase}/api/models`, {
      method: 'POST',
      headers: hubCreateHeaders(),
      body: JSON.stringify({
        prompt,
        model: 'gemini-2.5-flash',
        maxTokens: 120,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string; reply?: string; data?: { text?: string } };
    const raw =
      (typeof data.text === 'string' ? data.text : '') ||
      (typeof data.reply === 'string' ? data.reply : '') ||
      (typeof data.data?.text === 'string' ? data.data.text : '');
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { agentId?: string };
    const picked = normalizeAgentId(parsed.agentId);
    const member = team.find((m) => m.id === picked);
    if (!member) return null;
    return { target: member, method: 'llm' };
  } catch {
    return null;
  }
}

export async function triageWidgetMessage(message: string, team: TeamMember[]): Promise<TriageResult> {
  if (!message.trim() || team.length <= 1) {
    return { target: team[0], method: 'default' };
  }
  const keywordResult = triageByKeywords(message, team);
  const llm = await triageByLlm(message, team);
  if (
    llm &&
    llm.target.role === 'orchestrator' &&
    keywordResult.method === 'keyword' &&
    keywordResult.target.role === 'specialist'
  ) {
    return keywordResult;
  }
  if (llm) return llm;
  return keywordResult;
}

export type MultiAgentRoutingMeta = {
  enabled: true;
  mode: MultiAgentMode;
  orchestratorId: string;
  routedAgentId: string;
  routedAgentName: string;
  handoff: boolean;
  triageMethod: TriageResult['method'];
  handoffSkippedReason?: 'specialist_not_synced';
  synthesized?: boolean;
  contributors?: Array<{
    agentId: string;
    name: string;
    role: 'orchestrator' | 'specialist';
  }>;
};

export type ParallelFlowResult = {
  reply: string;
  meta: MultiAgentRoutingMeta;
  routedHubAgentId: string;
};

export function buildMultiAgentStatusMessage(
  phase: 'triage' | 'parallel' | 'handoff' | 'synthesize',
  specialistName?: string,
): string {
  switch (phase) {
    case 'triage':
      return 'Analizando tu consulta…';
    case 'parallel':
      return 'Consultando especialistas en paralelo…';
    case 'handoff':
      return specialistName
        ? `Conectando con ${specialistName}…`
        : 'Derivando a un especialista…';
    case 'synthesize':
      return 'Preparando respuesta unificada…';
    default:
      return 'Procesando…';
  }
}

export function buildHandoffPrefix(orchestratorName: string, specialistName: string): string {
  return `[${orchestratorName} → ${specialistName}] `;
}

export async function applyMultiAgentRouting(params: {
  rawBody: string;
  config: WidgetMultiAgentConfig;
  userId: string;
  plan: string;
}): Promise<{ body: string; routedHubAgentId: string; meta: MultiAgentRoutingMeta } | null> {
  if (!params.config.multiAgentEnabled || !isMultiAgentPlanEligible(params.plan)) {
    return null;
  }

  const team = await loadWidgetTeam(params.config, params.userId);
  if (team.length <= 1) return null;

  let parsed: { message?: string; agentId?: string; history?: unknown[] };
  try {
    parsed = JSON.parse(params.rawBody) as typeof parsed;
  } catch {
    return null;
  }

  const message = typeof parsed.message === 'string' ? parsed.message : '';
  const triage = await triageWidgetMessage(message, team);
  const orchestrator = team[0];
  const route = resolveRoutableHubAgentId(orchestrator, triage.target);
  if (!route) return null;

  parsed.agentId = route.hubId;

  return {
    body: JSON.stringify(parsed),
    routedHubAgentId: route.hubId,
    meta: {
      enabled: true,
      mode: params.config.multiAgentMode ?? 'triage',
      orchestratorId: orchestrator.id,
      routedAgentId: route.target.id,
      routedAgentName: route.target.name,
      handoff: route.handoff,
      triageMethod: triage.method,
      ...(route.handoffSkippedReason
        ? { handoffSkippedReason: route.handoffSkippedReason }
        : {}),
    },
  };
}

export function enrichChatResponseJson(
  rawText: string,
  meta: MultiAgentRoutingMeta,
  orchestratorName: string,
): string {
  try {
    const data = JSON.parse(rawText) as Record<string, unknown>;
    data.multiAgent = meta;
    if (meta.handoff && typeof data.reply === 'string' && data.reply.length > 0) {
      const prefix = buildHandoffPrefix(orchestratorName, meta.routedAgentName);
      if (!data.reply.startsWith(prefix)) {
        data.reply = prefix + data.reply;
      }
    }
    return JSON.stringify(data);
  } catch {
    return rawText;
  }
}

export async function validateMultiAgentWidgetSave(params: {
  userId: string;
  plan: string;
  orchestratorAgentId: string;
  multiAgentEnabled?: boolean;
  agentIds?: unknown;
}): Promise<{ ok: true; agentIds: string[] } | { ok: false; error: string; code: string }> {
  const enabled = params.multiAgentEnabled === true;
  const rawIds = Array.isArray(params.agentIds) ? params.agentIds : [];
  const agentIds = rawIds
    .filter((x): x is string => typeof x === 'string' && /^[a-f0-9]{24}$/i.test(x.trim()))
    .map((x) => x.trim())
    .filter((id) => id !== params.orchestratorAgentId)
    .slice(0, MULTI_AGENT_MAX_TEAM);

  if (!enabled) {
    return { ok: true, agentIds: [] };
  }

  if (!isMultiAgentPlanEligible(params.plan)) {
    return {
      ok: false,
      error: 'El widget multiagente está disponible solo en los planes Business y Enterprise.',
      code: 'MULTI_AGENT_PLAN_REQUIRED',
    };
  }

  if (agentIds.length === 0) {
    const parent = await ClientAgent.findOne({
      _id: params.orchestratorAgentId,
      userId: params.userId,
    })
      .select({ subAgentIds: 1 })
      .lean();
    const subs = (parent?.subAgentIds ?? []).filter(Boolean);
    if (subs.length === 0) {
      return {
        ok: false,
        error: 'Activa al menos un especialista (sub-agente o agente del equipo) para el widget multiagente.',
        code: 'MULTI_AGENT_TEAM_EMPTY',
      };
    }
  }

  if (agentIds.length) {
    const count = await ClientAgent.countDocuments({
      _id: { $in: agentIds },
      userId: params.userId,
      status: 'active',
    });
    if (count !== agentIds.length) {
      return {
        ok: false,
        error: 'Uno o más agentes del equipo no son válidos o no te pertenecen.',
        code: 'MULTI_AGENT_INVALID_TEAM',
      };
    }
  }

  return { ok: true, agentIds };
}

function extractHubReply(json: Record<string, unknown>): string {
  if (typeof json.reply === 'string' && json.reply.trim()) return json.reply.trim();
  if (typeof json.response === 'string' && json.response.trim()) return json.response.trim();
  if (typeof json.text === 'string' && json.text.trim()) return json.text.trim();
  return '';
}

function buildHubChatBody(rawBody: string, hubAgentId: string): string {
  const parsed = JSON.parse(rawBody) as Record<string, unknown>;
  parsed.agentId = hubAgentId;
  return JSON.stringify(parsed);
}

async function postHubWidgetChat(params: {
  hubBase: string;
  rawBody: string;
  hubAgentId: string;
  widgetToken: string;
  traceId: string;
  secret: string;
}): Promise<{ ok: boolean; reply: string }> {
  const body = buildHubChatBody(params.rawBody, params.hubAgentId);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Trace-Id': params.traceId,
    'X-Request-Id': params.traceId,
    'X-Widget-Token': params.widgetToken,
    'X-Landing-Wt-Valid': '1',
    [SIGNATURE_HEADER]: signRequest(body, params.secret),
  };
  const url = `${params.hubBase.replace(/\/$/, '')}/api/widget/chat`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(90_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.code === 'AGENT_COOLDOWN' || json.error) {
      return { ok: false, reply: '' };
    }
    return { ok: true, reply: extractHubReply(json) };
  } catch {
    return { ok: false, reply: '' };
  }
}

export function buildParallelSynthesisPrompt(params: {
  userMessage: string;
  orchestratorName: string;
  specialistName: string;
  orchestratorReply: string;
  specialistReply: string;
}): string {
  return [
    'Eres un orquestador de widget de chat. Redacta UNA sola respuesta final para el visitante.',
    'Combina el contexto del orquestador con la respuesta técnica del especialista.',
    'Tono claro y profesional. No menciones agentes internos ni procesos de routing.',
    'No incluyas JSON ni metadatos.',
    '',
    `Orquestador (${params.orchestratorName}):`,
    params.orchestratorReply || '(sin respuesta)',
    '',
    `Especialista (${params.specialistName}):`,
    params.specialistReply || '(sin respuesta)',
    '',
    `Pregunta del usuario: ${params.userMessage.slice(0, 2000)}`,
  ].join('\n');
}

async function synthesizeParallelReplies(params: {
  userMessage: string;
  orchestratorName: string;
  specialistName: string;
  orchestratorReply: string;
  specialistReply: string;
}): Promise<string | null> {
  const hubBase = getAibackhubBaseUrl();
  if (!hubBase) return null;
  const prompt = buildParallelSynthesisPrompt(params);
  try {
    const res = await fetch(`${hubBase}/api/models`, {
      method: 'POST',
      headers: hubCreateHeaders(),
      body: JSON.stringify({
        prompt,
        model: 'gemini-2.5-flash',
        maxTokens: 1200,
        temperature: 0.35,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string; reply?: string; data?: { text?: string } };
    const text =
      (typeof data.text === 'string' ? data.text : '') ||
      (typeof data.reply === 'string' ? data.reply : '') ||
      (typeof data.data?.text === 'string' ? data.data.text : '');
    return text.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Fase 2: consulta orquestador + especialista en paralelo y sintetiza una respuesta.
 * Solo aplica con handoff; si no hay handoff, devuelve null (usar triaje simple).
 */
export async function executeParallelMultiAgentFlow(params: {
  rawBody: string;
  config: WidgetMultiAgentConfig;
  userId: string;
  plan: string;
  widgetToken: string;
  traceId: string;
  hubSecret: string;
  onPhase?: (phase: 'triage' | 'parallel' | 'synthesize', message: string) => void;
}): Promise<ParallelFlowResult | null> {
  if (
    !params.config.multiAgentEnabled ||
    params.config.multiAgentMode !== 'parallel' ||
    !isMultiAgentPlanEligible(params.plan)
  ) {
    return null;
  }

  const hubBase = getAibackhubBaseUrl();
  if (!hubBase || !params.hubSecret.trim()) return null;

  const team = await loadWidgetTeam(params.config, params.userId);
  if (team.length <= 1) return null;

  let message = '';
  try {
    const parsed = JSON.parse(params.rawBody) as { message?: string };
    message = typeof parsed.message === 'string' ? parsed.message : '';
  } catch {
    return null;
  }

  const triage = await triageWidgetMessage(message, team);
  params.onPhase?.('triage', buildMultiAgentStatusMessage('triage'));
  const orchestrator = team[0];
  const route = resolveRoutableHubAgentId(orchestrator, triage.target);
  if (!route?.handoff) return null;

  const orchHubId = resolveHubAgentId(orchestrator);
  const specHubId = resolveHubAgentId(route.target);
  if (!orchHubId || !specHubId) return null;
  const specialist = route.target;

  params.onPhase?.('parallel', buildMultiAgentStatusMessage('parallel'));
  const [orchRes, specRes] = await Promise.all([
    postHubWidgetChat({
      hubBase,
      rawBody: params.rawBody,
      hubAgentId: orchHubId,
      widgetToken: params.widgetToken,
      traceId: params.traceId,
      secret: params.hubSecret,
    }),
    postHubWidgetChat({
      hubBase,
      rawBody: params.rawBody,
      hubAgentId: specHubId,
      widgetToken: params.widgetToken,
      traceId: params.traceId,
      secret: params.hubSecret,
    }),
  ]);

  const specialistReply = specRes.reply;
  const orchestratorReply = orchRes.reply;
  if (!specialistReply && !orchestratorReply) return null;

  params.onPhase?.('synthesize', buildMultiAgentStatusMessage('synthesize'));
  const synthesized = await synthesizeParallelReplies({
    userMessage: message,
    orchestratorName: orchestrator.name,
    specialistName: specialist.name,
    orchestratorReply,
    specialistReply,
  });

  const reply =
    synthesized ||
    specialistReply ||
    orchestratorReply ||
    'No pude generar una respuesta en este momento.';

  return {
    reply,
    routedHubAgentId: specHubId,
    meta: {
      enabled: true,
      mode: 'parallel',
      orchestratorId: orchestrator.id,
      routedAgentId: route.target.id,
      routedAgentName: route.target.name,
      handoff: true,
      triageMethod: triage.method,
      synthesized: Boolean(synthesized),
      contributors: [
        { agentId: orchestrator.id, name: orchestrator.name, role: 'orchestrator' },
        { agentId: specialist.id, name: specialist.name, role: 'specialist' },
      ],
    },
  };
}

export function validateMultiAgentMode(mode: unknown): MultiAgentMode {
  return mode === 'parallel' ? 'parallel' : 'triage';
}
