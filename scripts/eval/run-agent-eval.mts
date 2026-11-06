/**
 * Banco de pruebas de agentes (Fase 1).
 *
 *   npx tsx --env-file=.env scripts/eval/run-agent-eval.mts evals/navi-app.json [--only id1,id2] [--concurrency 2]
 *
 * Necesita MONGODB_URI (solo lectura de la config del widget/agente) y el hub: BACKEND_URL,
 * AIBACKHUB_API_KEY y AIBACKHUB_TENANT_ID. Para medir lo que ven los usuarios, apuntar al hub de
 * producción. El hub corre en modo de prueba: nada se guarda ni sale (tickets, webhooks, leads).
 *
 * Escribe evals/results/<agente>/<fecha>.json y .md, y compara con la corrida anterior.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { validateEvalSuite, type EvalSuite } from '../../src/lib/eval/agent-eval-cases.ts';
import { judgeReply, type JudgeResult } from '../../src/lib/eval/agent-eval-judge.ts';
import {
  compareEvalRuns,
  renderEvalReport,
  summarizeEvalRun,
  type EvalCaseResult,
  type EvalRunSummary,
} from '../../src/lib/eval/agent-eval-report.ts';
import {
  assertHubSupportsSandbox,
  hubJudgeModelCall,
  loadEvalAgentContext,
  runEvalTurn,
} from '../../src/lib/eval/agent-eval-runner.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const suitePath = args.find((a) => !a.startsWith('--'));
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!suitePath) {
  console.error('Uso: run-agent-eval.mts <suite.json> [--only id1,id2] [--concurrency 2] [--judge-model gemini-2.5-flash]');
  process.exit(2);
}
for (const k of ['MONGODB_URI', 'BACKEND_URL']) {
  if (!process.env[k]) {
    console.error(`Falta ${k}`);
    process.exit(2);
  }
}

const suite = JSON.parse(readFileSync(resolve(root, suitePath), 'utf8')) as EvalSuite;
const problems = validateEvalSuite(suite);
if (problems.length) {
  console.error('Suite inválida:\n- ' + problems.join('\n- '));
  process.exit(2);
}
const only = flag('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const cases = only?.length ? suite.cases.filter((c) => only.includes(c.id)) : suite.cases;
const concurrency = Math.max(1, Math.min(4, Number(flag('concurrency') ?? 2)));
const judge = hubJudgeModelCall(flag('judge-model') ?? 'gemini-2.5-flash');

const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[-:.TZ]/g, '').slice(0, 14);
console.log(`Banco de pruebas — ${suite.agent}: ${cases.length} casos · hub ${new URL(process.env.BACKEND_URL!).host}`);

// Candado: solo contra un hub con modo de prueba (si no, las herramientas que escriben se ejecutarían).
await assertHubSupportsSandbox(process.env.BACKEND_URL!);
const ctx = await loadEvalAgentContext(suite.widgetId);
const results: EvalCaseResult[] = new Array(cases.length);
let next = 0;
async function worker() {
  while (next < cases.length) {
    const i = next++;
    const c = cases[i];
    const turn = await runEvalTurn(ctx, c, runId);
    let judged: JudgeResult;
    if (turn.error) {
      judged = { verdict: 'incorrect', factsCovered: [], unsupportedClaims: [], reason: `Error: ${turn.error}` };
    } else {
      try {
        judged = await judgeReply(c, turn.reply, judge, ctx.judgeSources);
      } catch (err) {
        // Un fallo del juez no tumba la corrida: el caso queda marcado para revisarlo a mano.
        judged = { verdict: 'incorrect', factsCovered: [], unsupportedClaims: [], reason: `Juez sin veredicto: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    results[i] = { id: c.id, category: c.category, message: c.message, reply: turn.reply, path: turn.path, latencyMs: turn.latencyMs, judge: judged, ...(turn.error ? { error: turn.error } : {}) };
    console.log(`  ${String(i + 1).padStart(2)}/${cases.length} ${judged.verdict.padEnd(13)} ${c.id} (${turn.path}, ${(turn.latencyMs / 1000).toFixed(1)} s)`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const summary = summarizeEvalRun(suite.agent, startedAt, results);
const outDir = join(root, 'evals/results', suite.agent);
mkdirSync(outDir, { recursive: true });
const previousFile = readdirSync(outDir).filter((f) => f.endsWith('.json')).sort().pop();
let comparison;
if (previousFile && !only?.length) {
  const prev = JSON.parse(readFileSync(join(outDir, previousFile), 'utf8')) as { summary: EvalRunSummary; results: EvalCaseResult[] };
  comparison = compareEvalRuns(prev, { summary, results });
}
const stem = join(outDir, runId);
writeFileSync(`${stem}.json`, JSON.stringify({ suite: basename(suitePath), summary, results, comparison }, null, 2));
writeFileSync(`${stem}.md`, renderEvalReport(summary, results, comparison));

const p = (n: number) => `${Math.round(n * 100)}%`;
console.log(
  `\nPuntuación ${p(summary.score)} · correctas ${summary.counts.correct}/${summary.total} · inventó ${summary.counts.hallucination} · "no sé" de más ${summary.counts.wrong_refusal} · p50 ${(summary.latencyP50Ms / 1000).toFixed(1)} s`,
);
if (comparison) {
  console.log(`Contra ${previousFile}: ${comparison.scoreDelta >= 0 ? '+' : ''}${Math.round(comparison.scoreDelta * 100)} pts · empeoraron ${comparison.regressions.length} · mejoraron ${comparison.improvements.length}`);
}
console.log(`Informe: ${stem}.md`);
await mongoose.disconnect().catch(() => {});
process.exit(0);
