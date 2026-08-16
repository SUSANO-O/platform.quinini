/**
 * Panel live de observabilidad admin: slug ofuscado + scores 0–100
 * derivados de telemetría real (éxito / rapidez), no de un juez LLM.
 */

export const ADMIN_OPS_LIVE_SLUG = '7c3a9f12e8b04d61';
export const ADMIN_OPS_LIVE_PATH = `/admin/ops/${ADMIN_OPS_LIVE_SLUG}`;
export const ADMIN_OPS_LIVE_API = `/api/admin/ops/${ADMIN_OPS_LIVE_SLUG}/live`;
export const ADMIN_OPS_CONSOLE_API = `/api/admin/ops/${ADMIN_OPS_LIVE_SLUG}/console`;

/** 40 s = 0 de rapidez (mismo techo visual que el eje de latencia). */
export const SPEED_SLOW_MS = 40_000;
export const DEFAULT_LIVE_WINDOW_MIN = 15;
export const MAX_LIVE_AGENTS = 24;

export function isAdminOpsLiveSlug(slug: string | undefined | null): boolean {
  return slug === ADMIN_OPS_LIVE_SLUG;
}

export type LiveTimelinePoint = {
  minute: string;
  requests: number;
  avgSec: number;
};

export function trafficWho(
  agents: LiveAgentPoint[],
  othersCollapsed = 0,
): { names: string[]; more: number; active: number } {
  const names = agents
    .filter((a) => a.agentId !== '_others' && a.requests > 0)
    .map((a) => a.label);
  const more = Math.max(0, othersCollapsed);
  return { names, more, active: names.length + more };
}

function bogotaHourMinute(iso: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  return {
    hour: Number(parts.find((p) => p.type === 'hour')?.value ?? 0),
    minute: Number(parts.find((p) => p.type === 'minute')?.value ?? 0),
  };
}

function clockKey(totalMin: number, step: number): string {
  let m = totalMin % (24 * 60);
  if (m < 0) m += 24 * 60;
  const hour = Math.floor(m / 60) % 24;
  const minute = step === 60 ? 0 : m % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Rellena huecos de la ventana para que el gráfico pinte desde el primer turno. */
export function pointHasLatency(point: Pick<LiveTimelinePoint, 'requests' | 'avgSec'>): boolean {
  return point.requests > 0 && Number.isFinite(point.avgSec);
}

/** Eje Y redondeado (evita ticks tipo 0 / 24 / 47). */
export function niceChartAxis(
  value: number,
  opts?: { integer?: boolean; minMax?: number },
): { max: number; ticks: number[] } {
  const minMax = opts?.minMax ?? (opts?.integer ? 4 : 5);
  const raw = Math.max(Number.isFinite(value) ? value : 0, minMax);
  const exp = Math.floor(Math.log10(raw));
  const mag = 10 ** exp;
  const n = raw / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  let max = nice * mag;
  if (opts?.integer) max = Math.max(max, Math.ceil(raw));
  if (max < raw) max = nice === 10 ? 10 * mag * 10 : (n <= 5 ? 10 : 2) * mag;
  const step =
    max <= 10 ? (opts?.integer ? 2 : 2) : max <= 20 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : max / 5;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) {
    ticks.push(Math.round(t * 10) / 10);
  }
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return { max, ticks };
}

export function fillLiveTimeline(
  sparse: LiveTimelinePoint[],
  windowMin: number,
  nowIso: string,
): LiveTimelinePoint[] {
  const step = windowMin >= 1440 ? 60 : 1;
  const n = Math.max(1, Math.round(windowMin / step));
  const byKey = new Map<string, LiveTimelinePoint>();
  for (const p of sparse) {
    const key = step === 60 ? `${String(p.minute).slice(0, 2).padStart(2, '0')}:00` : p.minute;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { minute: key, requests: p.requests, avgSec: p.avgSec });
      continue;
    }
    const requests = prev.requests + p.requests;
    const avgSec =
      requests > 0
        ? Math.round(((prev.avgSec * prev.requests + p.avgSec * p.requests) / requests) * 10) / 10
        : 0;
    byKey.set(key, { minute: key, requests, avgSec });
  }

  const { hour, minute } = bogotaHourMinute(nowIso);
  const endMin = hour * 60 + (step === 60 ? 0 : minute);
  const out: LiveTimelinePoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = clockKey(endMin - i * step, step);
    out.push(byKey.get(key) ?? { minute: key, requests: 0, avgSec: 0 });
  }
  return out;
}

export type AgentLatencyRow = {
  agentId: string;
  name?: string;
  requests: number;
  okRequests: number;
  avgTotalMs: number;
  p95TotalMs?: number;
};

export type LiveAgentPoint = {
  agentId: string;
  label: string;
  requests: number;
  success: number;
  speed: number;
  load: number;
  avgSec: number;
  p95Sec: number;
  prevAvgSec: number | null;
};

export function successScore(okRequests: number, requests: number): number {
  if (requests <= 0) return 0;
  return Math.round((okRequests / requests) * 100);
}

export function speedScore(avgMs: number, slowMs = SPEED_SLOW_MS): number {
  if (slowMs <= 0) return 0;
  const ratio = 1 - avgMs / slowMs;
  return Math.round(Math.min(100, Math.max(0, ratio * 100)));
}

export function foldTopAgents(
  rows: AgentLatencyRow[],
  limit: number,
): { agents: AgentLatencyRow[]; others: AgentLatencyRow | null } {
  const sorted = [...rows].sort((a, b) => b.requests - a.requests);
  if (sorted.length <= limit) return { agents: sorted, others: null };
  const agents = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const requests = rest.reduce((s, r) => s + r.requests, 0);
  const okRequests = rest.reduce((s, r) => s + r.okRequests, 0);
  const avgTotalMs =
    requests > 0
      ? rest.reduce((s, r) => s + r.avgTotalMs * r.requests, 0) / requests
      : 0;
  const p95TotalMs = Math.max(0, ...rest.map((r) => r.p95TotalMs ?? r.avgTotalMs));
  return {
    agents,
    others: {
      agentId: '_others',
      name: 'Otros',
      requests,
      okRequests,
      avgTotalMs,
      p95TotalMs,
    },
  };
}

export function buildLiveAgentView(input: {
  current: AgentLatencyRow[];
  previous?: AgentLatencyRow[];
  maxAgents?: number;
}): { agents: LiveAgentPoint[]; othersCollapsed: number } {
  const { agents, others } = foldTopAgents(input.current, input.maxAgents ?? MAX_LIVE_AGENTS);
  const series = others ? [...agents, others] : agents;
  const prevById = new Map((input.previous ?? []).map((r) => [r.agentId, r]));
  const maxReq = Math.max(1, ...series.map((r) => r.requests));

  return {
    agents: series.map((r) => {
      const prev = r.agentId === '_others' ? null : prevById.get(r.agentId) ?? null;
      return {
        agentId: r.agentId,
        label: (r.name && r.name.trim()) || r.agentId.slice(0, 8),
        requests: r.requests,
        success: successScore(r.okRequests, r.requests),
        speed: speedScore(r.avgTotalMs),
        load: Math.round((r.requests / maxReq) * 100),
        avgSec: Math.round((r.avgTotalMs / 1000) * 10) / 10,
        p95Sec: Math.round(((r.p95TotalMs ?? r.avgTotalMs) / 1000) * 10) / 10,
        prevAvgSec: prev ? Math.round((prev.avgTotalMs / 1000) * 10) / 10 : null,
      };
    }),
    othersCollapsed: others ? input.current.length - agents.length : 0,
  };
}

export type ConsoleEventKind =
  | 'turn'
  | 'orquesta'
  | 'fase'
  | 'tools'
  | 'memoria'
  | 'rag'
  | 'tokens'
  | 'prompt'
  | 'sesion'
  | 'error';

export type ConsoleEvent = {
  id: string;
  at: string;
  kind: ConsoleEventKind;
  agentId: string;
  agentName: string;
  text: string;
};

export type ConsoleTurnInput = {
  traceId: string;
  at: string;
  agentId: string;
  agentName: string;
  path: string;
  ok: boolean;
  errorCode?: string | null;
  totalMs: number;
  phases: Record<string, number>;
  toolsUsed?: string[];
  historyTurns?: number;
  ragChars?: number;
  toolRounds?: number;
  model?: string;
  provider?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  systemChars?: number;
  toolDefsChars?: number;
  costUsd?: number | null;
  replyLen?: number | null;
  widgetId?: string | null;
  sessionId?: string | null;
  inferencePath?: string | null;
  inferenceMs?: number | null;
  ragEnabled?: boolean;
  agentModel?: string;
  agentType?: string;
  catalogToolCount?: number;
  sessionMsgCount?: number;
};

const PHASE_ORDER = [
  'vision',
  'auth',
  'human_guard',
  'multi_triage',
  'multi_pipeline',
  'multi_parallel',
  'ab_variant',
  'strict_purpose',
  'resolve',
  'hints',
  'infer_direct',
  'direct_mcp',
  'hub',
  'reveal',
  'post',
] as const;

const PHASE_LABEL: Record<string, string> = {
  vision: 'visión',
  auth: 'auth',
  human_guard: 'modo humano',
  multi_triage: 'distribuye / triaje',
  multi_pipeline: 'pipeline multiagente',
  multi_parallel: 'paralelo multiagente',
  ab_variant: 'variante A/B',
  strict_purpose: 'propósito estricto',
  resolve: 'resuelve agente',
  hints: 'hints',
  infer_direct: 'inferencia',
  direct_mcp: 'MCP directo',
  hub: 'orquesta / hub',
  reveal: 'revela respuesta',
  post: 'post',
};

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('es-CO');
}

function shortId(id: string | null | undefined, n = 8): string {
  const s = String(id || '').trim();
  if (!s) return '—';
  return s.length <= n ? s : s.slice(0, n);
}

const PATH_HINT: Record<string, string> = {
  'stream-direct-mcp': 'MCP directo',
  'stream-infer-direct': 'inferencia directa',
  'stream-hub': 'hub → motor',
  'stream-pipeline': 'pipeline multiagente',
  'stream-parallel': 'paralelo multiagente',
  'stream-error': 'error de stream',
  'non-stream-direct-mcp': 'MCP no-stream',
  'non-stream-infer-direct': 'inferencia no-stream',
  'non-stream-hub': 'hub no-stream',
  'human-mode': 'modo humano',
};

function phaseLabel(key: string): string {
  return PHASE_LABEL[key] || key;
}

export function expandTurnToConsoleLines(turn: ConsoleTurnInput): ConsoleEvent[] {
  const agentName = turn.agentName.trim() || turn.agentId.slice(0, 8);
  const base = {
    at: turn.at,
    agentId: turn.agentId,
    agentName,
  };
  const pathHint = PATH_HINT[turn.path] ? `  (${PATH_HINT[turn.path]})` : '';
  const lines: ConsoleEvent[] = [
    {
      ...base,
      id: `${turn.traceId}:turn`,
      kind: 'turn',
      text: `${turn.ok ? 'ok' : 'fail'}  ${agentName}  ${fmtMs(turn.totalMs)}  trace=${shortId(turn.traceId, 10)}`,
    },
    {
      ...base,
      id: `${turn.traceId}:orquesta`,
      kind: 'orquesta',
      text: `orquesta  path=${turn.path || '—'}${pathHint}`,
    },
  ];

  if (turn.inferencePath && turn.inferencePath !== turn.path) {
    lines.push({
      ...base,
      id: `${turn.traceId}:infer-path`,
      kind: 'orquesta',
      text: `  ├ infer  path=${turn.inferencePath}${turn.inferenceMs != null ? `  ${fmtMs(turn.inferenceMs)}` : ''}`,
    });
  }

  const model = turn.model || turn.agentModel;
  if (model || turn.provider) {
    lines.push({
      ...base,
      id: `${turn.traceId}:model`,
      kind: 'orquesta',
      text: `  ├ modelo  ${[turn.provider, model].filter(Boolean).join(' / ')}`,
    });
  }

  const phaseEntries = Object.entries(turn.phases || {})
    .filter(([, ms]) => typeof ms === 'number')
    .sort((a, b) => {
      const ia = PHASE_ORDER.indexOf(a[0] as (typeof PHASE_ORDER)[number]);
      const ib = PHASE_ORDER.indexOf(b[0] as (typeof PHASE_ORDER)[number]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }) as [string, number][];
  const phaseSum = phaseEntries.reduce((s, [, ms]) => s + ms, 0) || turn.totalMs || 1;
  let bottleneck: { key: string; ms: number } | null = null;
  for (const [key, ms] of phaseEntries) {
    if (!bottleneck || ms > bottleneck.ms) bottleneck = { key, ms };
    const pct = Math.round((ms / phaseSum) * 100);
    lines.push({
      ...base,
      id: `${turn.traceId}:fase:${key}`,
      kind: 'fase',
      text: `  ├ ${phaseLabel(key)}  ${fmtMs(ms)}  ${pct}%`,
    });
  }
  if (bottleneck && phaseEntries.length > 1) {
    lines.push({
      ...base,
      id: `${turn.traceId}:cuello`,
      kind: 'fase',
      text: `  ├ cuello  ${phaseLabel(bottleneck.key)}  ${Math.round((bottleneck.ms / phaseSum) * 100)}%`,
    });
  }

  const tools = (turn.toolsUsed || []).map(String).filter(Boolean).slice(0, 20);
  lines.push({
    ...base,
    id: `${turn.traceId}:tools`,
    kind: 'tools',
    text: `  ├ tools  ${tools.length ? `${tools.length} ids · ${turn.toolRounds ?? 0} rondas` : 'ninguna'}`,
  });
  for (const tool of tools) {
    lines.push({
      ...base,
      id: `${turn.traceId}:tool:${tool}`,
      kind: 'tools',
      text: `  │    ${tool}`,
    });
  }

  const memParts = [
    turn.historyTurns != null ? `${turn.historyTurns} turnos en prompt` : null,
    turn.sessionMsgCount != null ? `${turn.sessionMsgCount} msgs sesión` : null,
  ].filter(Boolean);
  if (memParts.length) {
    lines.push({
      ...base,
      id: `${turn.traceId}:memoria`,
      kind: 'memoria',
      text: `  ├ memoria  ${memParts.join(' · ')}`,
    });
  }

  const ragChars = turn.ragChars ?? 0;
  lines.push({
    ...base,
    id: `${turn.traceId}:rag`,
    kind: 'rag',
    text: `  ├ rag  ${turn.ragEnabled === true ? 'on' : turn.ragEnabled === false ? 'off' : '—'}  ${fmtInt(ragChars)} chars docs`,
  });

  const inTok = turn.inputTokens ?? 0;
  const outTok = turn.outputTokens ?? 0;
  const totTok = turn.totalTokens ?? (inTok || outTok ? inTok + outTok : 0);
  if (totTok || inTok || outTok) {
    lines.push({
      ...base,
      id: `${turn.traceId}:tokens`,
      kind: 'tokens',
      text: `  ├ tokens  in ${fmtInt(inTok)}  out ${fmtInt(outTok)}  total ${fmtInt(totTok)}`,
    });
  }

  const promptBits = [
    turn.systemChars ? `sys ${fmtInt(turn.systemChars)}c` : null,
    turn.toolDefsChars ? `tooldefs ${fmtInt(turn.toolDefsChars)}c` : null,
    turn.replyLen != null ? `reply ${fmtInt(turn.replyLen)}c` : null,
  ].filter(Boolean);
  if (promptBits.length) {
    lines.push({
      ...base,
      id: `${turn.traceId}:prompt`,
      kind: 'prompt',
      text: `  ├ prompt  ${promptBits.join(' · ')}`,
    });
  }

  if (turn.costUsd != null && turn.costUsd > 0) {
    lines.push({
      ...base,
      id: `${turn.traceId}:cost`,
      kind: 'tokens',
      text: `  ├ costo  USD ${turn.costUsd.toFixed(4).replace('.', ',')}`,
    });
  }

  const sesionBits = [
    turn.widgetId ? `widget ${shortId(turn.widgetId, 10)}` : null,
    turn.sessionId ? `sesión ${shortId(turn.sessionId, 10)}` : null,
    turn.agentType ? turn.agentType : null,
    turn.catalogToolCount != null ? `catálogo ${turn.catalogToolCount} tools` : null,
  ].filter(Boolean);
  if (sesionBits.length) {
    lines.push({
      ...base,
      id: `${turn.traceId}:sesion`,
      kind: 'sesion',
      text: `  ├ ${sesionBits.join(' · ')}`,
    });
  }

  if (!turn.ok) {
    lines.push({
      ...base,
      id: `${turn.traceId}:error`,
      kind: 'error',
      text: `  └ error  ${turn.errorCode || 'UNKNOWN'}`,
    });
  }

  return lines;
}
