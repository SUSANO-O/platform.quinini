/**
 * Análisis de cuellos de botella y recomendaciones accionables
 * para /admin/widget-latency.
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
  hub: 'Proxy Hub (AgentFlowhub → AIBackHub)',
  multi_agent: 'Multi-agente (triaje/handoff)',
  direct_mcp: 'MCP directo (webhooks/tools)',
  infer_direct: 'Inferencia directa (/api/models)',
  pipeline_parallel: 'Pipeline / Parallel (2+ LLM)',
  auth_overhead: 'Auth / validación (Mongo)',
  human_mode: 'Modo humano',
  errors: 'Errores / fallos',
  other: 'Otros paths',
};

const PHASE_GROUP_LABELS: Record<PhaseGroupKey, string> = {
  hub: 'Consulta al Hub',
  multi_agent: 'Multi-agente',
  direct_mcp: 'MCP / tools',
  infer_direct: 'Inferencia directa',
  auth: 'Auth / enrich',
  reveal: 'Reveal progresivo (Fase 3)',
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

function buildRecommendations(
  dominantPath: PathGroupKey | null,
  dominantPhase: PhaseGroupKey | null,
  pathGroups: WidgetLatencyInsights['pathGroups'],
  phaseGroups: WidgetLatencyInsights['phaseGroups'],
  avgTotalMs: number,
  revealAvgMs: number,
): LatencyRecommendation[] {
  const recs: LatencyRecommendation[] = [];

  const pipelineGroup = pathGroups.find((g) => g.key === 'pipeline_parallel');
  const multiPhase = phaseGroups.find((g) => g.key === 'multi_agent');
  const hubGroup = pathGroups.find((g) => g.key === 'hub');
  const mcpGroup = pathGroups.find((g) => g.key === 'direct_mcp');
  const revealGroup = phaseGroups.find((g) => g.key === 'reveal');

  if (dominantPath === 'pipeline_parallel' || (pipelineGroup && pipelineGroup.sharePct >= 25)) {
    recs.push({
      priority: 'alta',
      title: 'Multi-agente pipeline/parallel activo',
      action:
        'En Widget Builder, desactiva multi-agente en agentes que no necesiten especialistas. Usa un solo agente cuando baste.',
      impact: 'Puede reducir 50–75% del tiempo (evita 2–4 llamadas LLM por mensaje).',
      category: 'pipeline_parallel',
    });
  }

  if (
    dominantPath === 'multi_agent' ||
    dominantPhase === 'multi_agent' ||
    (multiPhase && multiPhase.shareOfPhaseTimePct >= 20)
  ) {
    recs.push({
      priority: 'alta',
      title: 'Triaje multi-agente consume tiempo',
      action:
        'Desactiva multiAgentEnabled o cambia a modo simple (sin pipeline/parallel). Considera modelo flash solo para triaje.',
      impact: '−30% a −60% en agentes con routing complejo.',
      category: 'multi_agent',
    });
  }

  if (dominantPath === 'hub' || dominantPath === 'direct_mcp' || (hubGroup && hubGroup.sharePct >= 40)) {
    recs.push({
      priority: 'alta',
      title: 'El Hub/MCP es el cuello principal',
      action:
        'Revisa tools y MCP habilitadas por agente (deja solo las necesarias). Limita rondas de tools. Para agentes simples sin MCP, fuerza inferencia directa.',
      impact: '−30% a −60% si hay muchas rondas tool + LLM.',
      category: 'hub',
    });
  }

  if (dominantPath === 'direct_mcp' || (mcpGroup && mcpGroup.sharePct >= 15)) {
    recs.push({
      priority: 'alta',
      title: 'MCP / webhooks dominan el path',
      action:
        'Audita enabledMcpToolIds y webhooks. Cada ronda suma LLM + API externa. Desactiva tools que no uses en producción.',
      impact: 'Alto en agentes HubSpot/sheets/webhook.',
      category: 'direct_mcp',
    });
  }

  if (dominantPath === 'infer_direct') {
    recs.push({
      priority: 'media',
      title: 'Inferencia directa (sin hub)',
      action:
        'Ya estás en el camino rápido. Optimiza modelo (flash vs pro), reduce historial y skills innecesarias.',
      impact: 'Marginal si el modelo sigue siendo pesado.',
      category: 'infer_direct',
    });
  }

  if (revealGroup && revealAvgMs >= 800) {
    recs.push({
      priority: 'media',
      title: 'Reveal progresivo añade delay artificial',
      action:
        'Reduce MAX_REVEAL_MS en widget-stream-reply.ts (ej. 2800 → 600 ms) o desactívalo en respuestas cortas.',
      impact: `Ahorra hasta ~${Math.round(revealAvgMs)} ms por mensaje tras recibir la respuesta.`,
      category: 'reveal',
    });
  }

  if (avgTotalMs >= 15_000) {
    recs.push({
      priority: 'alta',
      title: 'Latencia total muy alta (≥ 15 s)',
      action:
        'Prioridad: streaming real TTFT en AIBackHub (el usuario ve texto en 1–3 s aunque el total siga alto).',
      impact: 'Mejora percepción inmediata; no reduce tiempo total del LLM.',
      category: 'general',
    });
  }

  if (recs.length === 0) {
    recs.push({
      priority: 'baja',
      title: 'Sin cuello claro aún',
      action:
        'Genera más tráfico real en el widget (stream y non-stream). Filtra por agentId para ver un agente específico.',
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

  const recommendations = buildRecommendations(
    dominantPathGroup,
    dominantPhaseGroup,
    pathGroups,
    phaseGroups,
    avgTotalMs,
    revealAvg,
  );

  let decisionSummary = 'Aún no hay suficientes requests. Usa el widget en producción o staging y vuelve a revisar.';
  if (hasEnoughData && dominantPathGroup) {
    const pg = pathGroups[0];
    decisionSummary = `El ${pg.sharePct}% de los mensajes pasan por «${pg.label}» (prom. ${pg.avgTotalMs} ms). `;
    if (dominantPhaseGroup) {
      const ph = phaseGroups[0];
      decisionSummary += `La fase más costosa es «${ph.label}» (~${ph.avgMs} ms, ${ph.shareOfPhaseTimePct}% del tiempo medido).`;
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
    pathGroups,
    phaseGroups,
    recommendations,
    decisionSummary,
  };
}
