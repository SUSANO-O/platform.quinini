import type { EvalVerdict, JudgeResult } from '@/lib/eval/agent-eval-judge';

/** Resultado de un caso en una corrida. */
export type EvalCaseResult = {
  id: string;
  category: string;
  message: string;
  reply: string;
  /** Camino que respondió: hub-mcp | infer-direct | none. */
  path: string;
  latencyMs: number;
  judge: JudgeResult;
  /** Error al obtener la respuesta del agente (el caso cuenta como "incorrect"). */
  error?: string;
};

export type EvalRunSummary = {
  agent: string;
  startedAt: string;
  total: number;
  counts: Record<EvalVerdict, number>;
  /** correct / total. */
  accuracy: number;
  /** (correct + 0.5·partial) / total: la métrica principal para comparar corridas. */
  score: number;
  /** hallucination / total. */
  hallucinationRate: number;
  /** wrong_refusal / total. */
  wrongRefusalRate: number;
  latencyP50Ms: number;
  latencyP90Ms: number;
  byCategory: Record<string, { total: number; score: number }>;
};

const ZERO: Record<EvalVerdict, number> = { correct: 0, partial: 0, incorrect: 0, hallucination: 0, wrong_refusal: 0 };

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function caseScore(v: EvalVerdict): number {
  return v === 'correct' ? 1 : v === 'partial' ? 0.5 : 0;
}

export function summarizeEvalRun(agent: string, startedAt: string, results: EvalCaseResult[]): EvalRunSummary {
  const counts = { ...ZERO };
  const byCat: Record<string, { total: number; points: number }> = {};
  for (const r of results) {
    counts[r.judge.verdict] += 1;
    const cat = (byCat[r.category] ??= { total: 0, points: 0 });
    cat.total += 1;
    cat.points += caseScore(r.judge.verdict);
  }
  const total = results.length;
  const lat = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const div = total || 1;
  return {
    agent,
    startedAt,
    total,
    counts,
    accuracy: round(counts.correct / div),
    score: round((counts.correct + 0.5 * counts.partial) / div),
    hallucinationRate: round(counts.hallucination / div),
    wrongRefusalRate: round(counts.wrong_refusal / div),
    latencyP50Ms: pct(lat, 0.5),
    latencyP90Ms: pct(lat, 0.9),
    byCategory: Object.fromEntries(
      Object.entries(byCat)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, { total: v.total, score: round(v.points / v.total) }]),
    ),
  };
}

export type EvalComparison = {
  scoreDelta: number;
  hallucinationDelta: number;
  /** Casos que antes estaban bien (correct/partial) y ahora no, o de correct a partial. */
  regressions: Array<{ id: string; before: EvalVerdict; after: EvalVerdict }>;
  improvements: Array<{ id: string; before: EvalVerdict; after: EvalVerdict }>;
};

/** Compara con una corrida anterior caso a caso (solo ids presentes en ambas). */
export function compareEvalRuns(
  before: { summary: EvalRunSummary; results: Pick<EvalCaseResult, 'id' | 'judge'>[] },
  after: { summary: EvalRunSummary; results: Pick<EvalCaseResult, 'id' | 'judge'>[] },
): EvalComparison {
  const prev = new Map(before.results.map((r) => [r.id, r.judge.verdict]));
  const regressions: EvalComparison['regressions'] = [];
  const improvements: EvalComparison['improvements'] = [];
  for (const r of after.results) {
    const b = prev.get(r.id);
    if (!b) continue;
    const a = r.judge.verdict;
    const ds = caseScore(a) - caseScore(b);
    if (ds < 0 || (a === 'hallucination' && b !== 'hallucination')) regressions.push({ id: r.id, before: b, after: a });
    else if (ds > 0) improvements.push({ id: r.id, before: b, after: a });
  }
  return {
    scoreDelta: round(after.summary.score - before.summary.score),
    hallucinationDelta: round(after.summary.hallucinationRate - before.summary.hallucinationRate),
    regressions,
    improvements,
  };
}

const VERDICT_ES: Record<EvalVerdict, string> = {
  correct: '✅ correcta',
  partial: '🟡 parcial',
  incorrect: '❌ incorrecta',
  hallucination: '🚨 inventó',
  wrong_refusal: '🙅 no sé de más',
};

/** Informe legible (markdown) de una corrida, con la comparación si la hay. */
export function renderEvalReport(
  summary: EvalRunSummary,
  results: EvalCaseResult[],
  comparison?: EvalComparison,
): string {
  const p = (n: number) => `${Math.round(n * 100)}%`;
  const lines: string[] = [
    `# Banco de pruebas — ${summary.agent}`,
    '',
    `Corrida: ${summary.startedAt} · ${summary.total} casos`,
    '',
    `| Puntuación | Correctas | Inventó | No sé de más | Latencia p50 / p90 |`,
    `|---|---|---|---|---|`,
    `| **${p(summary.score)}** | ${summary.counts.correct} (${p(summary.accuracy)}) | ${summary.counts.hallucination} (${p(summary.hallucinationRate)}) | ${summary.counts.wrong_refusal} (${p(summary.wrongRefusalRate)}) | ${(summary.latencyP50Ms / 1000).toFixed(1)} s / ${(summary.latencyP90Ms / 1000).toFixed(1)} s |`,
    '',
    `Parciales: ${summary.counts.partial} · Incorrectas: ${summary.counts.incorrect}`,
    '',
    '## Por categoría',
    '',
    '| Categoría | Casos | Puntuación |',
    '|---|---|---|',
    ...Object.entries(summary.byCategory).map(([k, v]) => `| ${k} | ${v.total} | ${p(v.score)} |`),
  ];
  if (comparison) {
    const sign = (n: number) => (n > 0 ? `+${Math.round(n * 100)}` : `${Math.round(n * 100)}`);
    lines.push(
      '',
      '## Contra la corrida anterior',
      '',
      `Puntuación ${sign(comparison.scoreDelta)} pts · Inventó ${sign(comparison.hallucinationDelta)} pts`,
      '',
      comparison.regressions.length
        ? `**Empeoraron (${comparison.regressions.length}):** ${comparison.regressions.map((r) => `${r.id} (${r.before}→${r.after})`).join(', ')}`
        : 'Ningún caso empeoró.',
      comparison.improvements.length
        ? `**Mejoraron (${comparison.improvements.length}):** ${comparison.improvements.map((r) => `${r.id} (${r.before}→${r.after})`).join(', ')}`
        : '',
    );
  }
  const bad = results.filter((r) => r.judge.verdict !== 'correct');
  if (bad.length) {
    lines.push('', '## Casos a revisar', '');
    for (const r of bad) {
      lines.push(
        `### ${VERDICT_ES[r.judge.verdict]} · ${r.id} (${r.category})`,
        '',
        `**Pregunta:** ${r.message}`,
        '',
        `**Respuesta** (${r.path}, ${(r.latencyMs / 1000).toFixed(1)} s):`,
        '',
        '> ' + (r.error ? `ERROR: ${r.error}` : r.reply.trim().replace(/\n/g, '\n> ')),
        '',
        `**Juez:** ${r.judge.reason}${r.judge.unsupportedClaims.length ? ` · Sin respaldo: ${r.judge.unsupportedClaims.join(' | ')}` : ''}`,
        '',
      );
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
