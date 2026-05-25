/**
 * Widget multi-agente:
 * - Sub-agentes del orquestador → triaje automático (todos los planes).
 * - multiAgentEnabled (Business+) → varios orquestadores + modo paralelo + filtro de especialistas.
 */

import { ClientAgent } from '@/lib/db/models';
import {
  ensureClientAgentHubSynced,
  getAibackhubBaseUrl,
  getAgentflowhubBaseUrl,
  hubCreateHeaders,
} from '@/lib/aibackhub-sync';
import { signRequest, SIGNATURE_HEADER } from '@/lib/hub-signature';
import {
  isCompoundCreativeRequest,
  normalizePipelineConfig,
  PIPELINE_CONTENT_KEYS,
  PIPELINE_CREATIVE_KEYS,
  shouldRunPipeline,
  type PipelineConfig,
} from '@/lib/widget-pipeline-ui';

export { isCompoundCreativeRequest, shouldRunPipeline } from '@/lib/widget-pipeline-ui';

export const MULTI_AGENT_PLANS = new Set(['business', 'enterprise']);
export const MULTI_AGENT_MAX_TEAM = 5;

export type MultiAgentMode = 'triage' | 'parallel' | 'pipeline';

export type WidgetMultiAgentConfig = {
  multiAgentEnabled: boolean;
  multiAgentMode: MultiAgentMode;
  /** Agente principal del embed (widget.agentId). */
  orchestratorAgentId: string;
  /** Filtro opcional de especialistas (widget.agentIds). Vacío = todos los subs de cada orquestador. */
  agentIds: string[];
  /** Varios agentes top-level cuando multiAgentEnabled (widget.orchestratorAgentIds). */
  orchestratorAgentIds: string[];
  /** Pasos y disparador explícitos (modo pipeline, Business+). */
  pipelineConfig: PipelineConfig | null;
};

export type TeamMember = {
  id: string;
  hubId: string | null;
  name: string;
  description: string;
  role: 'orchestrator' | 'specialist';
  /** Especialista: _id del orquestador padre en Mongo. */
  parentOrchestratorId?: string;
};

export type WidgetRoutingCapabilities = {
  triage: boolean;
  parallel: boolean;
  pipeline: boolean;
  autoSubAgents: boolean;
  multiOrchestrator: boolean;
};

export function buildWidgetMultiAgentConfig(widget: {
  agentId?: unknown;
  multiAgentEnabled?: boolean;
  multiAgentMode?: unknown;
  agentIds?: unknown;
  orchestratorAgentIds?: unknown;
  pipelineConfig?: unknown;
}): WidgetMultiAgentConfig {
  const orchestratorAgentIds = Array.isArray(widget.orchestratorAgentIds)
    ? widget.orchestratorAgentIds
        .filter((x): x is string => typeof x === 'string' && /^[a-f0-9]{24}$/i.test(x.trim()))
        .map((x) => x.trim())
    : [];
  const agentIds = Array.isArray(widget.agentIds)
    ? widget.agentIds
        .filter((x): x is string => typeof x === 'string' && /^[a-f0-9]{24}$/i.test(x.trim()))
        .map((x) => x.trim())
    : [];
  const orchestratorAgentId = normalizeAgentId(widget.agentId);
  const multiAgentEnabled = widget.multiAgentEnabled === true;
  const multiAgentMode = validateMultiAgentMode(widget.multiAgentMode);
  const allOrchIds = [orchestratorAgentId, ...orchestratorAgentIds].filter(Boolean);
  const pipelineConfig =
    multiAgentEnabled && multiAgentMode === 'pipeline'
      ? normalizePipelineConfig(widget.pipelineConfig, allOrchIds)
      : null;
  return {
    multiAgentEnabled,
    multiAgentMode,
    orchestratorAgentId,
    agentIds,
    orchestratorAgentIds,
    pipelineConfig,
  };
}

/** Cuándo aplicar triaje / paralelo según equipo y plan. */
export function resolveWidgetRoutingCapabilities(
  config: WidgetMultiAgentConfig,
  team: TeamMember[],
  plan: string,
): WidgetRoutingCapabilities {
  if (team.length <= 1) {
    return { triage: false, parallel: false, pipeline: false, autoSubAgents: false, multiOrchestrator: false };
  }
  const orchestrators = team.filter((m) => m.role === 'orchestrator');
  const hasSpecialists = team.some((m) => m.role === 'specialist');
  const multiOrchestrator = orchestrators.length > 1;
  const premium = config.multiAgentEnabled && isMultiAgentPlanEligible(plan);
  const autoSubAgents = hasSpecialists && !multiOrchestrator;
  const triage = autoSubAgents || premium;
  const parallel = premium && config.multiAgentMode === 'parallel' && hasSpecialists;
  const pipeline = premium && config.multiAgentMode === 'pipeline' && multiOrchestrator;
  return { triage, parallel, pipeline, autoSubAgents, multiOrchestrator };
}

export function findOrchestratorForMember(team: TeamMember[], target: TeamMember): TeamMember {
  if (target.role === 'orchestrator') return target;
  const parentId = target.parentOrchestratorId;
  if (parentId) {
    const parent = team.find((m) => m.id === parentId && m.role === 'orchestrator');
    if (parent) return parent;
  }
  return team.find((m) => m.role === 'orchestrator') ?? team[0];
}

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
  const primaryId = normalizeAgentId(config.orchestratorAgentId);
  if (!primaryId) return [];

  let orchIds: string[] = [primaryId];
  if (config.multiAgentEnabled && config.orchestratorAgentIds.length > 0) {
    orchIds = [...new Set([primaryId, ...config.orchestratorAgentIds.map(normalizeAgentId).filter(Boolean)])].slice(
      0,
      MULTI_AGENT_MAX_TEAM,
    );
  }

  const specialistFilter = new Set(
    (config.agentIds ?? []).map(normalizeAgentId).filter((id) => id && id !== primaryId),
  );
  const useFilter = specialistFilter.size > 0;

  const orchestrators = await ClientAgent.find({
    _id: { $in: orchIds },
    status: 'active',
    type: 'agent',
    $or: [{ userId }, { isPlatform: true }],
  })
    .select({ name: 1, description: 1, systemPrompt: 1, agentHubId: 1, subAgentIds: 1 })
    .lean();

  const orchById = new Map(orchestrators.map((o) => [String(o._id), o]));
  const orderedOrchs = orchIds.map((id) => orchById.get(id)).filter(Boolean) as typeof orchestrators;
  if (!orderedOrchs.length) return [];

  const specialistIdSet = new Set<string>();
  for (const orch of orderedOrchs) {
    const oid = String(orch._id);
    for (const raw of orch.subAgentIds ?? []) {
      const sid = String(raw).trim();
      if (!sid || sid === oid) continue;
      if (useFilter && !specialistFilter.has(sid)) continue;
      specialistIdSet.add(sid);
    }
  }

  const specialists = specialistIdSet.size
    ? await ClientAgent.find({
        _id: { $in: [...specialistIdSet] },
        status: 'active',
        $or: [{ userId }, { isPlatform: true }],
      })
        .select({ name: 1, description: 1, systemPrompt: 1, agentHubId: 1, parentAgentId: 1 })
        .lean()
    : [];

  const specById = new Map(specialists.map((s) => [String(s._id), s]));

  const members: TeamMember[] = [];
  for (const orch of orderedOrchs) {
    const oid = String(orch._id);
    members.push({
      id: oid,
      hubId: orch.agentHubId ? String(orch.agentHubId) : null,
      name: orch.name ?? 'Orquestador',
      description: (orch.description ?? '').trim(),
      role: 'orchestrator',
      parentOrchestratorId: oid,
    });
    for (const raw of orch.subAgentIds ?? []) {
      const sid = String(raw).trim();
      if (!sid || sid === oid) continue;
      if (useFilter && !specialistFilter.has(sid)) continue;
      const s = specById.get(sid);
      if (!s) continue;
      members.push({
        id: sid,
        hubId: s.agentHubId ? String(s.agentHubId) : null,
        name: s.name ?? 'Especialista',
        description: (s.description ?? '').trim(),
        role: 'specialist',
        parentOrchestratorId: oid,
      });
    }
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
  triageMethod: TriageResult['method'] | 'configured';
  handoffSkippedReason?: 'specialist_not_synced';
  synthesized?: boolean;
  pipeline?: boolean;
  pipelineSteps?: Array<{
    step: 'content' | 'creative';
    agentId: string;
    name: string;
  }>;
  contributors?: Array<{
    agentId: string;
    name: string;
    role: 'orchestrator' | 'specialist';
  }>;
};

export type PipelineFlowResult = {
  reply: string;
  meta: MultiAgentRoutingMeta;
  routedHubAgentId: string;
  images?: Array<{ dataUrl: string; mimeType?: string }>;
};

export type ParallelFlowResult = {
  reply: string;
  meta: MultiAgentRoutingMeta;
  routedHubAgentId: string;
};

export function buildMultiAgentStatusMessage(
  phase: 'triage' | 'parallel' | 'handoff' | 'synthesize' | 'content' | 'creative',
  specialistName?: string,
): string {
  switch (phase) {
    case 'triage':
      return 'Analizando tu consulta…';
    case 'content':
      return 'Recopilando información del producto…';
    case 'creative':
      return specialistName
        ? `Generando creativo con ${specialistName}…`
        : 'Generando creativo…';
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
  const team = await loadWidgetTeam(params.config, params.userId);
  const caps = resolveWidgetRoutingCapabilities(params.config, team, params.plan);
  if (!caps.triage || team.length <= 1) return null;

  let parsed: { message?: string; agentId?: string; history?: unknown[] };
  try {
    parsed = JSON.parse(params.rawBody) as typeof parsed;
  } catch {
    return null;
  }

  const message = typeof parsed.message === 'string' ? parsed.message : '';
  const triage = await triageWidgetMessage(message, team);
  const primaryOrch = team.find((m) => m.id === params.config.orchestratorAgentId) ?? team[0];
  const route = resolveRoutableHubAgentId(primaryOrch, triage.target);
  if (!route) return null;

  const orchForMeta = findOrchestratorForMember(team, route.target);
  parsed.agentId = route.hubId;

  return {
    body: JSON.stringify(parsed),
    routedHubAgentId: route.hubId,
    meta: {
      enabled: true,
      mode:
        params.config.multiAgentMode === 'parallel' && caps.parallel
          ? 'parallel'
          : params.config.multiAgentMode === 'pipeline' && caps.pipeline
            ? 'pipeline'
            : 'triage',
      orchestratorId: orchForMeta.id,
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
  orchestratorAgentIds?: unknown;
}): Promise<
  | { ok: true; agentIds: string[]; orchestratorAgentIds: string[] }
  | { ok: false; error: string; code: string }
> {
  const enabled = params.multiAgentEnabled === true;
  const rawOrchIds = Array.isArray(params.orchestratorAgentIds) ? params.orchestratorAgentIds : [];
  const orchestratorAgentIds = rawOrchIds
    .filter((x): x is string => typeof x === 'string' && /^[a-f0-9]{24}$/i.test(x.trim()))
    .map((x) => x.trim())
    .filter((id) => id !== params.orchestratorAgentId)
    .slice(0, MULTI_AGENT_MAX_TEAM - 1);

  const rawIds = Array.isArray(params.agentIds) ? params.agentIds : [];
  const agentIds = rawIds
    .filter((x): x is string => typeof x === 'string' && /^[a-f0-9]{24}$/i.test(x.trim()))
    .map((x) => x.trim())
    .filter((id) => id !== params.orchestratorAgentId && !orchestratorAgentIds.includes(id))
    .slice(0, MULTI_AGENT_MAX_TEAM);

  if (!enabled) {
    return { ok: true, agentIds: [], orchestratorAgentIds: [] };
  }

  if (!isMultiAgentPlanEligible(params.plan)) {
    return {
      ok: false,
      error: 'El widget multiagente está disponible solo en los planes Business y Enterprise.',
      code: 'MULTI_AGENT_PLAN_REQUIRED',
    };
  }

  const allOrchIds = [params.orchestratorAgentId, ...orchestratorAgentIds];

  if (orchestratorAgentIds.length) {
    const orchCount = await ClientAgent.countDocuments({
      _id: { $in: orchestratorAgentIds },
      userId: params.userId,
      status: 'active',
      type: 'agent',
    });
    if (orchCount !== orchestratorAgentIds.length) {
      return {
        ok: false,
        error: 'Uno o más agentes orquestadores no son válidos o no te pertenecen.',
        code: 'MULTI_AGENT_INVALID_ORCHESTRATORS',
      };
    }
  }

  if (agentIds.length === 0) {
    const parents = await ClientAgent.find({
      _id: { $in: allOrchIds },
      userId: params.userId,
      status: 'active',
    })
      .select({ subAgentIds: 1 })
      .lean();
    const totalSubs = parents.reduce((n, p) => n + (p.subAgentIds ?? []).filter(Boolean).length, 0);
    if (totalSubs === 0) {
      return {
        ok: false,
        error:
          'Selecciona agentes con sub-agentes o marca especialistas del equipo para activar el widget multiagente.',
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

  return { ok: true, agentIds, orchestratorAgentIds };
}

export async function validatePipelineWidgetConfigSave(params: {
  userId: string;
  plan: string;
  multiAgentEnabled: boolean;
  multiAgentMode: MultiAgentMode;
  orchestratorAgentId: string;
  orchestratorAgentIds: string[];
  pipelineConfig: unknown;
}): Promise<
  | { ok: true; pipelineConfig: PipelineConfig | null }
  | { ok: false; error: string; code: string }
> {
  if (!params.multiAgentEnabled || params.multiAgentMode !== 'pipeline') {
    return { ok: true, pipelineConfig: null };
  }

  if (!isMultiAgentPlanEligible(params.plan)) {
    return {
      ok: false,
      error: 'El pipeline está disponible solo en los planes Business y Enterprise.',
      code: 'PIPELINE_PLAN_REQUIRED',
    };
  }

  const allOrchIds = [params.orchestratorAgentId, ...params.orchestratorAgentIds].filter(Boolean);
  const normalized = normalizePipelineConfig(params.pipelineConfig, allOrchIds);
  if (!normalized) {
    return {
      ok: false,
      error: 'Configura el pipeline: dos pasos con agentes distintos de la grilla.',
      code: 'PIPELINE_CONFIG_INVALID',
    };
  }

  const stepAgentIds = [...new Set(normalized.steps.map((s) => s.agentId))];
  const count = await ClientAgent.countDocuments({
    _id: { $in: stepAgentIds },
    userId: params.userId,
    status: 'active',
    type: 'agent',
  });
  if (count !== stepAgentIds.length) {
    return {
      ok: false,
      error: 'Uno o más agentes del pipeline no son válidos o no te pertenecen.',
      code: 'PIPELINE_AGENT_INVALID',
    };
  }

  return { ok: true, pipelineConfig: normalized };
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
  rawBody: string;
  hubAgentId: string;
  widgetToken: string;
  traceId: string;
  secret: string;
}): Promise<{
  ok: boolean;
  reply: string;
  images?: Array<{ dataUrl: string; mimeType?: string }>;
}> {
  const hubBase = getAgentflowhubBaseUrl();
  if (!hubBase || !params.secret.trim()) return { ok: false, reply: '' };

  const body = buildHubChatBody(params.rawBody, params.hubAgentId);
  const headers: Record<string, string> = {
    ...hubCreateHeaders(),
    'X-Trace-Id': params.traceId,
    'X-Request-Id': params.traceId,
    'X-Widget-Token': params.widgetToken,
    'X-Landing-Wt-Valid': '1',
    [SIGNATURE_HEADER]: signRequest(body, params.secret),
  };

  const fetchOnce = async (base: string) => {
    const url = `${base.replace(/\/$/, '')}/api/widget/chat`;
    return fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(90_000),
    });
  };

  try {
    let res: Response;
    try {
      res = await fetchOnce(hubBase);
    } catch (first) {
      try {
        const u = new URL(hubBase);
        if (u.hostname === '127.0.0.1') u.hostname = 'localhost';
        else if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
        else throw first;
        res = await fetchOnce(u.origin);
      } catch {
        return { ok: false, reply: '' };
      }
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.code === 'AGENT_COOLDOWN' || json.error) {
      return { ok: false, reply: '' };
    }
    const images = Array.isArray(json.images)
      ? (json.images as Array<{ dataUrl?: string; mimeType?: string }>)
          .filter((img) => typeof img?.dataUrl === 'string')
          .map((img) => ({ dataUrl: String(img.dataUrl), mimeType: img.mimeType }))
      : undefined;
    return { ok: true, reply: extractHubReply(json), images };
  } catch {
    return { ok: false, reply: '' };
  }
}

function scorePipelineBucket(message: string, member: TeamMember, bucket: 'content' | 'creative'): number {
  const text = `${member.name} ${member.description}`.toLowerCase();
  const msg = message.toLowerCase();
  const keys = bucket === 'content' ? PIPELINE_CONTENT_KEYS : PIPELINE_CREATIVE_KEYS;
  let score = 0;
  for (const key of keys) {
    if (msg.includes(key) && text.includes(key)) score += 6;
    else if (msg.includes(key)) score += 2;
    else if (text.includes(key)) score += 1;
  }
  if (bucket === 'creative' && /\d+\s*[x×]\s*\d+/.test(msg)) score += 8;
  if (bucket === 'content' && /venta|vendedor|producto|auto|catálogo|catalogo/i.test(text)) score += 4;
  if (bucket === 'creative' && /imagen|banner|creativ|diseño|diseno|visual|graphic/i.test(text)) score += 4;
  return score;
}

function resolvePipelinePair(
  message: string,
  team: TeamMember[],
  config: WidgetMultiAgentConfig,
): { content: TeamMember; creative: TeamMember; triageMethod: 'keyword' | 'configured' } | null {
  const orchestrators = team.filter((m) => m.role === 'orchestrator');
  if (orchestrators.length < 2) return null;

  if (config.pipelineConfig) {
    if (!shouldRunPipeline(message, config.pipelineConfig.trigger)) return null;
    const byId = new Map(orchestrators.map((o) => [o.id, o]));
    const contentStep = config.pipelineConfig.steps.find((s) => s.role === 'content');
    const creativeStep = config.pipelineConfig.steps.find((s) => s.role === 'creative');
    if (!contentStep || !creativeStep) return null;
    const content = byId.get(contentStep.agentId);
    const creative = byId.get(creativeStep.agentId);
    if (!content || !creative || content.id === creative.id) return null;
    return { content, creative, triageMethod: 'configured' };
  }

  const pair = pickPipelineAgents(message, team);
  if (!pair) return null;
  return { content: pair.content, creative: pair.creative, triageMethod: 'keyword' };
}

/** Elige orquestador de contenido y de creativo (distintos) para pipeline en cadena. */
export function pickPipelineAgents(
  message: string,
  team: TeamMember[],
): { content: TeamMember; creative: TeamMember } | null {
  if (!isCompoundCreativeRequest(message)) return null;
  const orchestrators = team.filter((m) => m.role === 'orchestrator');
  if (orchestrators.length < 2) return null;

  const ranked = orchestrators.map((o) => ({
    member: o,
    content: scorePipelineBucket(message, o, 'content'),
    creative: scorePipelineBucket(message, o, 'creative'),
  }));

  const contentPick = [...ranked].sort((a, b) => b.content - a.content)[0];
  if (!contentPick) return null;

  const others = ranked.filter((r) => r.member.id !== contentPick.member.id);
  if (!others.length) return null;

  const creativePick = [...others].sort((a, b) => b.creative - a.creative)[0];
  if (!creativePick) return null;

  const msgHasStrongCreative =
    /\d+\s*[x×]\s*\d+/.test(message.toLowerCase()) ||
    PIPELINE_CREATIVE_KEYS.some((k) => message.toLowerCase().includes(k));

  // Con 2 orquestadores: el mensaje mixto basta — contenido al mejor match, creativo al otro.
  if (orchestrators.length === 2 && msgHasStrongCreative) {
    return { content: contentPick.member, creative: creativePick.member };
  }

  if (contentPick.content < 2 || creativePick.creative < 2) return null;

  return { content: contentPick.member, creative: creativePick.member };
}

export function buildPipelineContentPrompt(userMessage: string): string {
  return [
    'Tarea interna (pipeline creativo del widget).',
    'Extrae SOLO un brief factual en viñetas para un diseñador gráfico.',
    'Usa tu catálogo, almacenamiento y conocimiento de producto. Sin saludos ni preguntas al visitante.',
    'Incluye claims, datos y textos sugeridos si aplican.',
    '',
    `Solicitud original: ${userMessage.slice(0, 2000)}`,
  ].join('\n');
}

export function buildPipelineCreativePrompt(params: {
  userMessage: string;
  contentBrief: string;
  contentAgentName: string;
}): string {
  return [
    `Brief de contenido (de ${params.contentAgentName}):`,
    params.contentBrief.slice(0, 4000) || '(sin brief)',
    '',
    `Solicitud del visitante: ${params.userMessage.slice(0, 2000)}`,
    '',
    'Genera el entregable creativo solicitado (dimensiones, formato, estilo).',
    'Usa tus herramientas de imagen si están disponibles.',
  ].join('\n');
}

function buildHubChatBodyWithMessage(rawBody: string, hubAgentId: string, message: string): string {
  const parsed = JSON.parse(rawBody) as Record<string, unknown>;
  parsed.agentId = hubAgentId;
  parsed.message = message;
  return JSON.stringify(parsed);
}

/**
 * Pipeline en cadena: agente de contenido (RAG/producto) → agente creativo (imagen/banner).
 * Requiere multi-orquestador (2+ agentes top-level) y modo pipeline (Business+).
 */
export async function executePipelineMultiAgentFlow(params: {
  rawBody: string;
  config: WidgetMultiAgentConfig;
  userId: string;
  plan: string;
  widgetToken: string;
  traceId: string;
  hubSecret: string;
  onPhase?: (phase: 'content' | 'creative', message: string) => void;
}): Promise<PipelineFlowResult | null> {
  const team = await loadWidgetTeam(params.config, params.userId);
  const caps = resolveWidgetRoutingCapabilities(params.config, team, params.plan);
  if (!caps.pipeline || team.length <= 1) return null;
  if (!getAgentflowhubBaseUrl() || !params.hubSecret.trim()) return null;

  let message = '';
  try {
    const parsed = JSON.parse(params.rawBody) as { message?: string };
    message = typeof parsed.message === 'string' ? parsed.message : '';
  } catch {
    return null;
  }

  const pair = resolvePipelinePair(message, team, params.config);
  if (!pair) return null;

  const contentHubId = resolveHubAgentId(pair.content);
  const creativeHubId = resolveHubAgentId(pair.creative);
  if (!contentHubId || !creativeHubId) return null;

  params.onPhase?.('content', buildMultiAgentStatusMessage('content'));
  const contentBody = buildHubChatBodyWithMessage(
    params.rawBody,
    contentHubId,
    buildPipelineContentPrompt(message),
  );
  const contentRes = await postHubWidgetChat({
    rawBody: contentBody,
    hubAgentId: contentHubId,
    widgetToken: params.widgetToken,
    traceId: `${params.traceId}-pipe-content`,
    secret: params.hubSecret,
  });
  if (!contentRes.ok || !contentRes.reply.trim()) return null;

  params.onPhase?.('creative', buildMultiAgentStatusMessage('creative', pair.creative.name));
  const creativeBody = buildHubChatBodyWithMessage(
    params.rawBody,
    creativeHubId,
    buildPipelineCreativePrompt({
      userMessage: message,
      contentBrief: contentRes.reply,
      contentAgentName: pair.content.name,
    }),
  );
  const creativeRes = await postHubWidgetChat({
    rawBody: creativeBody,
    hubAgentId: creativeHubId,
    widgetToken: params.widgetToken,
    traceId: `${params.traceId}-pipe-creative`,
    secret: params.hubSecret,
  });
  if (!creativeRes.ok || !creativeRes.reply.trim()) return null;

  const prefix = buildHandoffPrefix(pair.content.name, pair.creative.name);
  const reply = creativeRes.reply.startsWith(prefix) ? creativeRes.reply : prefix + creativeRes.reply;

  return {
    reply,
    routedHubAgentId: creativeHubId,
    images: creativeRes.images,
    meta: {
      enabled: true,
      mode: 'pipeline',
      orchestratorId: pair.content.id,
      routedAgentId: pair.creative.id,
      routedAgentName: pair.creative.name,
      handoff: true,
      triageMethod: pair.triageMethod,
      pipeline: true,
      pipelineSteps: [
        { step: 'content', agentId: pair.content.id, name: pair.content.name },
        { step: 'creative', agentId: pair.creative.id, name: pair.creative.name },
      ],
      contributors: [
        { agentId: pair.content.id, name: pair.content.name, role: 'orchestrator' },
        { agentId: pair.creative.id, name: pair.creative.name, role: 'orchestrator' },
      ],
    },
  };
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
  const team = await loadWidgetTeam(params.config, params.userId);
  const caps = resolveWidgetRoutingCapabilities(params.config, team, params.plan);
  if (!caps.parallel || team.length <= 1) return null;
  if (!getAgentflowhubBaseUrl() || !params.hubSecret.trim()) return null;

  let message = '';
  try {
    const parsed = JSON.parse(params.rawBody) as { message?: string };
    message = typeof parsed.message === 'string' ? parsed.message : '';
  } catch {
    return null;
  }

  const triage = await triageWidgetMessage(message, team);
  params.onPhase?.('triage', buildMultiAgentStatusMessage('triage'));
  const primaryOrch = team.find((m) => m.id === params.config.orchestratorAgentId) ?? team[0];
  const route = resolveRoutableHubAgentId(primaryOrch, triage.target);
  if (!route?.handoff) return null;

  const orchestrator = findOrchestratorForMember(team, route.target);
  const orchHubId = resolveHubAgentId(orchestrator);
  const specHubId = resolveHubAgentId(route.target);
  if (!orchHubId || !specHubId) return null;
  const specialist = route.target;

  params.onPhase?.('parallel', buildMultiAgentStatusMessage('parallel'));
  const [orchRes, specRes] = await Promise.all([
    postHubWidgetChat({
      rawBody: params.rawBody,
      hubAgentId: orchHubId,
      widgetToken: params.widgetToken,
      traceId: params.traceId,
      secret: params.hubSecret,
    }),
    postHubWidgetChat({
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
  if (mode === 'parallel') return 'parallel';
  if (mode === 'pipeline') return 'pipeline';
  return 'triage';
}
