/**
 * Análisis de cuellos de botella y recomendaciones accionables
 * para /admin/widget-latency.
 *
 * `direct-mcp` es el *camino de código* (Gemini vía capa MCP), no “HubSpot corrió”.
 * Si ese path y `infer-direct` tardan igual, el cuello es el modelo.
 */

export type LatencyPathRow = { path: string; requests: number; avgTotalMs: number };
export type LatencyPhaseRow = { phase: string; avgMs: number; samples: number };

export type PathGroupKey =
  | 'hub'
  | 'multi_agent'
  | 'direct_mcp'
  | 'infer_direct'
  | 'pipeline_parallel'
  | 'auth_overhead'
  | 'human_mode'
  | 'errors'
  | 'other';

export type PhaseGroupKey =
  | 'hub'
  | 'multi_agent'
  | 'direct_mcp'
  | 'infer_direct'
  | 'auth'
  | 'reveal'
  | 'vision'
  | 'other';

export type LatencyRecommendation = {
  priority: 'alta' | 'media' | 'baja';
  title: string;
  action: string;
  impact: string;
  category: PathGroupKey | PhaseGroupKey | 'general';
};

export type WidgetLatencyInsights = {
  hasEnoughData: boolean;
  totalRequests: number;
  dominantPathGroup: PathGroupKey | null;
  dominantPathLabel: string | null;
  dominantPathSharePct: number;
  dominantPhaseGroup: PhaseGroupKey | null;
  dominantPhaseLabel: string | null;
  dominantPhaseAvgMs: number;
  streamSharePct: number;
  nonStreamSharePct: number;
  pathGroups: Array<{
    key: PathGroupKey;
    label: string;
    requests: number;
    sharePct: number;
    avgTotalMs: number;
  }>;
  phaseGroups: Array<{
    key: PhaseGroupKey;
    label: string;
    avgMs: number;
    samples: number;
    shareOfPhaseTimePct: number;
  }>;
  recommendations: LatencyRecommendation[];
  decisionSummary: string;
};

const PATH_GROUP_LABELS: Record<PathGroupKey, string> = {
  hub: 'Proxy Hub → motor',
  multi_agent: 'Triaje / handoff (LLM extra)',
  direct_mcp: 'Motor MCP (Gemini; tools si las hay)',
  infer_direct: 'Inferencia directa (mismo modelo)',
  pipeline_parallel: 'Pipeline / Parallel (2+ LLM)',
  auth_overhead: 'Auth / validación (Mongo)',
  human_mode: 'Modo humano',
  errors: 'Errores / fallos',
  other: 'Otros paths',
};

const PHASE_GROUP_LABELS: Record<PhaseGroupKey, string> = {
  hub: 'Consulta al Hub',
  multi_agent: 'Triaje LLM extra',
  direct_mcp: 'Bloque motor MCP (incluye LLM)',
  infer_direct: 'Inferencia del agente',
  auth: 'Auth / enrich',
  reveal: 'Reveal progresivo',
  vision: 'Visión / OCR',
  other: 'Otras fases',
};

function classifyPath(path: string): PathGroupKey {
  const p = path.toLowerCase();
  if (!p || p === '(unknown)') return 'other';
  if (p.includes('error')) return 'errors';
  if (p.includes('human')) return 'human_mode';
  if (p.includes('pipeline') || p.includes('parallel')) return 'pipeline_parallel';
  if (p.includes('direct-mcp') || p.includes('direct_mcp')) return 'direct_mcp';
  if (p.includes('infer-direct') || p.includes('infer_direct')) return 'infer_direct';
  if (p.includes('hub')) return 'hub';
  return 'other';
}

function classifyPhase(phase: string): PhaseGroupKey {
  const p = phase.toLowerCase();
  if (p === 'hub' || p === 'hints' || p === 'resolve') return 'hub';
  if (p.startsWith('multi_') || p === 'multi_pipeline' || p === 'multi_parallel' || p === 'multi_triage') {
    return 'multi_agent';
  }
  if (p === 'direct_mcp' || p === 'mcp' || p === 'tools') return 'direct_mcp';
  if (p === 'infer_direct' || p === 'model' || p === 'skills' || p === 'rag') return 'infer_direct';
  if (p === 'auth' || p === 'human_guard' || p === 'enrich' || p === 'strict_purpose' || p === 'ab_variant') {
    return 'auth';
  }
  if (p === 'reveal') return 'reveal';
  if (p === 'vision') return 'vision';
  return 'other';
}

function fmtSec(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function avgsClose(a: number, b: number, ratio = 0.25): boolean {
  const m = Math.max(a, b, 1);
  return Math.abs(a - b) / m <= ratio;
}

function streamSplit(byPath: LatencyPathRow[]): {
  streamSharePct: number;
  nonStreamSharePct: number;
  streamAvgMs: number;
  nonStreamAvgMs: number;
} {
  let streamN = 0;
  let streamMs = 0;
  let nonN = 0;
  let nonMs = 0;
  for (const row of byPath) {
    const p = row.path.toLowerCase();
    if (p.startsWith('stream')) {
      streamN += row.requests;
      streamMs += row.avgTotalMs * row.requests;
    } else if (p.includes('non-stream') || p.startsWith('non-stream')) {
      nonN += row.requests;
      nonMs += row.avgTotalMs * row.requests;
    }
  }
  const total = streamN + nonN;
  return {
    streamSharePct: total > 0 ? Math.round((streamN / total) * 1000) / 10 : 0,
    nonStreamSharePct: total > 0 ? Math.round((nonN / total) * 1000) / 10 : 0,
    streamAvgMs: streamN > 0 ? Math.round(streamMs / streamN) : 0,
    nonStreamAvgMs: nonN > 0 ? Math.round(nonMs / nonN) : 0,
  };
}

function isModelSaturated(
  pathGroups: WidgetLatencyInsights['pathGroups'],
): boolean {
  const mcp = pathGroups.find((g) => g.key === 'direct_mcp');
  const infer = pathGroups.find((g) => g.key === 'infer_direct');
  if (!mcp || !infer || mcp.requests < 20 || infer.requests < 20) return false;
  if (mcp.avgTotalMs < 12_000 || infer.avgTotalMs < 12_000) return false;
  return avgsClose(mcp.avgTotalMs, infer.avgTotalMs, 0.25);
}

function buildRecommendations(
  pathGroups: WidgetLatencyInsights['pathGroups'],
  phaseGroups: WidgetLatencyInsights['phaseGroups'],
  avgTotalMs: number,
  revealAvgMs: number,
  split: ReturnType<typeof streamSplit>,
  modelSaturated: boolean,
): LatencyRecommendation[] {
  const recs: LatencyRecommendation[] = [];

  const pipelineGroup = pathGroups.find((g) => g.key === 'pipeline_parallel');
  const multiPhase = phaseGroups.find((g) => g.key === 'multi_agent');
  const hubGroup = pathGroups.find((g) => g.key === 'hub');
  const mcpGroup = pathGroups.find((g) => g.key === 'direct_mcp');
  const inferGroup = pathGroups.find((g) => g.key === 'infer_direct');

  if (modelSaturated) {
    recs.push({
      priority: 'alta',
      title: 'El modelo está saturado (no las tools)',
      action:
        'Motor MCP e inferencia directa tardan casi igual. Eso es espera a Gemini/el LLM, no HubSpot ni webhooks. Semáforo de inflight; no apagues MCP por esta métrica.',
      impact: 'Quitar tools no baja una media de ~27 s si ambos caminos están lentos.',
      category: 'infer_direct',
    });
  }

  if (pipelineGroup && pipelineGroup.sharePct >= 25) {
    recs.push({
      priority: 'alta',
      title: 'Pipeline/parallel apila 2+ LLM por turno',
      action:
        'Cada mensaje dispara varias inferencias. Usa pipeline solo si el producto lo necesita; si no, un orquestador. No es lo mismo que apagar el equipo de ventas.',
      impact: 'Evitar 2–4 llamadas LLM por mensaje cuando el modo no aporta.',
      category: 'pipeline_parallel',
    });
  }

  if (multiPhase && (multiPhase.avgMs >= 3_000 || multiPhase.shareOfPhaseTimePct >= 20)) {
    recs.push({
      priority: 'alta',
      title: 'El triaje suma un LLM extra por turno',
      action:
        'Casi cada mensaje llama a un modelo de triaje y luego al agente. Si el equipo hace falta, no lo apagues: clasificador barato/flash o saltar triaje bajo carga.',
      impact: 'Quitar ese infer extra recorta ~30–50% del tiempo de turno, sin matar el handoff.',
      category: 'multi_agent',
    });
  }

  if (!modelSaturated && hubGroup && hubGroup.sharePct >= 25) {
    recs.push({
      priority: 'alta',
      title: 'La mayoría del tráfico pasa por el proxy Hub',
      action:
        'Revisa AGENTFLOWHUB_URL y el health del Hub. Este path es el proxy, no “MCP/tools”.',
      impact: 'Si el Hub está lento o caído, todo este porcentaje se arrastra.',
      category: 'hub',
    });
  }

  if (
    !modelSaturated
    && mcpGroup
    && inferGroup
    && mcpGroup.requests >= 20
    && inferGroup.requests >= 20
    && mcpGroup.avgTotalMs > inferGroup.avgTotalMs * 1.3
  ) {
    recs.push({
      priority: 'media',
      title: 'El camino MCP es más lento que inferencia directa',
      action:
        'Ahí sí puede haber rondas de tools. Revisa tools/MCP de ese agente; no confundir con saturación del modelo.',
      impact: 'Solo aplica si MCP es claramente más lento que /api/models.',
      category: 'direct_mcp',
    });
  }

  if (split.nonStreamSharePct >= 60 && avgTotalMs >= 15_000) {
    recs.push({
      priority: 'media',
      title: 'Esta muestra es casi toda non-stream',
      action:
        'El widget de producción ya streamea. Un % alto de non-stream suele ser inyector o clientes viejos. Filtra `stream-*` para ver visitantes.',
      impact: `Ahora ${split.nonStreamSharePct}% non-stream (~${fmtSec(split.nonStreamAvgMs)}) vs ${split.streamSharePct}% stream (~${fmtSec(split.streamAvgMs)}).`,
      category: 'general',
    });
  }

  if (revealAvgMs >= 800) {
    recs.push({
      priority: 'media',
      title: 'Reveal progresivo añade delay artificial',
      action:
        'Reduce MAX_REVEAL_MS en widget-stream-reply.ts (ej. 2800 → 600 ms) o desactívalo en respuestas cortas.',
      impact: `Ahorra hasta ~${Math.round(revealAvgMs)} ms por mensaje tras recibir la respuesta.`,
      category: 'reveal',
    });
  }

  if (avgTotalMs >= 15_000 && split.streamAvgMs >= 15_000) {
    recs.push({
      priority: 'media',
      title: 'Aun en stream el total sigue alto',
      action:
        'Streaming mejora percepción (TTFT), no el tiempo total. El recorte real está en triaje extra + cola del modelo.',
      impact: 'El usuario ve texto antes; la media de 27 s no baja sola.',
      category: 'general',
    });
  }

  if (recs.length === 0) {
    recs.push({
      priority: 'baja',
      title: 'Sin cuello claro aún',
      action:
        'Genera más tráfico real en el widget (stream). Filtra por agentId para ver un agente específico.',
      impact: 'Más datos → decisiones más precisas.',
      category: 'general',
    });
  }

  const seen = new Set<string>();
  return recs.filter((r) => {
    if (seen.has(r.title)) return false;
    seen.add(r.title);
    return true;
  });
}

export function analyzeWidgetLatencyInsights(input: {
  totalRequests: number;
  avgTotalMs: number;
  byPath: LatencyPathRow[];
  byPhase: LatencyPhaseRow[];
}): WidgetLatencyInsights {
  const { totalRequests, avgTotalMs, byPath, byPhase } = input;
  const hasEnoughData = totalRequests >= 5;
  const split = streamSplit(byPath);

  const pathGroupMap = new Map<PathGroupKey, { requests: number; totalMs: number }>();
  for (const row of byPath) {
    const key = classifyPath(row.path);
    const cur = pathGroupMap.get(key) ?? { requests: 0, totalMs: 0 };
    cur.requests += row.requests;
    cur.totalMs += row.avgTotalMs * row.requests;
    pathGroupMap.set(key, cur);
  }

  const pathGroups = Array.from(pathGroupMap.entries())
    .map(([key, v]) => ({
      key,
      label: PATH_GROUP_LABELS[key],
      requests: v.requests,
      sharePct: totalRequests > 0 ? Math.round((v.requests / totalRequests) * 1000) / 10 : 0,
      avgTotalMs: v.requests > 0 ? Math.round(v.totalMs / v.requests) : 0,
    }))
    .sort((a, b) => b.requests - a.requests);

  const phaseGroupMap = new Map<PhaseGroupKey, { totalMs: number; samples: number }>();
  for (const row of byPhase) {
    const key = classifyPhase(row.phase);
    const cur = phaseGroupMap.get(key) ?? { totalMs: 0, samples: 0 };
    cur.totalMs += row.avgMs * row.samples;
    cur.samples += row.samples;
    phaseGroupMap.set(key, cur);
  }

  const totalPhaseWeighted = Array.from(phaseGroupMap.values()).reduce((s, v) => s + v.totalMs, 0);

  const phaseGroups = Array.from(phaseGroupMap.entries())
    .map(([key, v]) => ({
      key,
      label: PHASE_GROUP_LABELS[key],
      avgMs: v.samples > 0 ? Math.round(v.totalMs / v.samples) : 0,
      samples: v.samples,
      shareOfPhaseTimePct:
        totalPhaseWeighted > 0 ? Math.round((v.totalMs / totalPhaseWeighted) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.shareOfPhaseTimePct - a.shareOfPhaseTimePct);

  const dominantPathGroup = pathGroups[0]?.requests ? pathGroups[0].key : null;
  const dominantPhaseGroup = phaseGroups[0]?.samples ? phaseGroups[0].key : null;
  const revealAvg = phaseGroups.find((g) => g.key === 'reveal')?.avgMs ?? 0;
  const modelSaturated = isModelSaturated(pathGroups);

  const recommendations = buildRecommendations(
    pathGroups,
    phaseGroups,
    avgTotalMs,
    revealAvg,
    split,
    modelSaturated,
  );

  let decisionSummary = 'Aún no hay suficientes requests. Usa el widget en producción o staging y vuelve a revisar.';
  if (hasEnoughData && dominantPathGroup) {
    const mcp = pathGroups.find((g) => g.key === 'direct_mcp');
    const infer = pathGroups.find((g) => g.key === 'infer_direct');
    const triage = phaseGroups.find((g) => g.key === 'multi_agent');
    if (modelSaturated && mcp && infer) {
      decisionSummary =
        `Motor MCP (${fmtSec(mcp.avgTotalMs)}) e inferencia directa (${fmtSec(infer.avgTotalMs)}) tardan casi igual: el cuello es el modelo, no webhooks.`;
      if (triage && triage.avgMs >= 3_000) {
        decisionSummary +=
          ` La fase más cara es el triaje LLM (~${fmtSec(triage.avgMs)}, un infer extra).`;
      }
    } else {
      const pg = pathGroups[0];
      decisionSummary = `El ${pg.sharePct}% de los mensajes pasan por «${pg.label}» (prom. ${fmtSec(pg.avgTotalMs)}). `;
      if (dominantPhaseGroup) {
        const ph = phaseGroups[0];
        decisionSummary += `La fase más costosa es «${ph.label}» (~${fmtSec(ph.avgMs)}, ${ph.shareOfPhaseTimePct}% del tiempo medido).`;
      }
    }
  }

  return {
    hasEnoughData,
    totalRequests,
    dominantPathGroup,
    dominantPathLabel: dominantPathGroup ? PATH_GROUP_LABELS[dominantPathGroup] : null,
    dominantPathSharePct: pathGroups[0]?.sharePct ?? 0,
    dominantPhaseGroup,
    dominantPhaseLabel: dominantPhaseGroup ? PHASE_GROUP_LABELS[dominantPhaseGroup] : null,
    dominantPhaseAvgMs: phaseGroups[0]?.avgMs ?? 0,
    streamSharePct: split.streamSharePct,
    nonStreamSharePct: split.nonStreamSharePct,
    pathGroups,
    phaseGroups,
    recommendations,
    decisionSummary,
  };
}
