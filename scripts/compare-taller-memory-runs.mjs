/**
 * Compara las corridas acumuladas de audit-taller-memory.mjs (los
 * audit-taller-memory-run-*.json en esta carpeta, más el snapshot vigente
 * audit-taller-memory.json) para ver tendencia real en el tiempo: latencia,
 * score promedio, fugas de privacidad y flags de calidad. Puramente local —
 * no pega a ningún servidor ni Mongo, solo lee los JSON ya generados.
 *
 * Uso: node scripts/compare-taller-memory-runs.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));

const files = readdirSync(DIR).filter(
  (f) => /^audit-taller-memory(-run-.*)?\.json$/.test(f),
);

const runs = [];
for (const f of files) {
  try {
    const j = JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));
    if (!j.at || !j.latencia || !j.byAxis) continue;
    const scores = Object.values(j.byAxis).map((a) => a.score);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    runs.push({
      file: f,
      at: j.at,
      avgMs: j.latencia.avg,
      maxMs: j.latencia.max,
      leak: j.leak,
      avgScore,
      flags: j.flags || {},
      byAxis: j.byAxis,
    });
  } catch {
    console.warn(`⚠️  ${f}: no se pudo parsear, se omite`);
  }
}

runs.sort((a, b) => new Date(a.at) - new Date(b.at));

if (runs.length === 0) {
  console.log('No hay corridas válidas para comparar.');
  process.exit(0);
}

console.log(`\n${runs.length} corridas, ${runs[0].at.slice(0, 10)} → ${runs[runs.length - 1].at.slice(0, 10)}\n`);

const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad('fecha/hora', 20) + pad('avg ms', 9) + pad('max ms', 9) + pad('score', 8) + pad('fuga', 6) + 'flags',
);
console.log('-'.repeat(80));

for (const r of runs) {
  const when = r.at.replace('T', ' ').slice(0, 16);
  const flagStr = Object.entries(r.flags)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
  const leakMark = r.leak ? 'SI ⚠️' : 'no';
  console.log(
    pad(when, 20) + pad(r.avgMs, 9) + pad(r.maxMs, 9) + pad(r.avgScore + '%', 8) + pad(leakMark, 6) + flagStr,
  );
}

// Tendencia: primera corrida vs última
const first = runs[0];
const last = runs[runs.length - 1];
const deltaAvg = last.avgMs - first.avgMs;
const deltaMax = last.maxMs - first.maxMs;
const deltaScore = last.avgScore - first.avgScore;

console.log('\n' + '='.repeat(80));
console.log('Tendencia (primera corrida → última corrida):');
console.log(
  `  latencia avg: ${first.avgMs}ms → ${last.avgMs}ms  (${deltaAvg >= 0 ? '+' : ''}${deltaAvg}ms)`,
);
console.log(
  `  latencia max: ${first.maxMs}ms → ${last.maxMs}ms  (${deltaMax >= 0 ? '+' : ''}${deltaMax}ms)`,
);
console.log(
  `  score promedio: ${first.avgScore}% → ${last.avgScore}%  (${deltaScore >= 0 ? '+' : ''}${deltaScore}pp)`,
);

const anyLeak = runs.some((r) => r.leak);
console.log(`  fuga de privacidad en alguna corrida: ${anyLeak ? '⚠️  SÍ — revisar cuál' : 'no, ninguna'}`);

// Por eje: promedio de score a través de todas las corridas + peor corrida por eje
const axisKeys = [...new Set(runs.flatMap((r) => Object.keys(r.byAxis)))];
console.log('\nPor eje (promedio de score across todas las corridas, peor caso):');
console.log(pad('eje', 24) + pad('score prom.', 13) + 'peor score (corrida)');
for (const axis of axisKeys) {
  const vals = runs.filter((r) => r.byAxis[axis]).map((r) => ({ score: r.byAxis[axis].score, at: r.at }));
  if (!vals.length) continue;
  const avg = Math.round(vals.reduce((a, b) => a + b.score, 0) / vals.length);
  const worst = vals.reduce((a, b) => (b.score < a.score ? b : a));
  console.log(pad(axis, 24) + pad(avg + '%', 13) + `${worst.score}% (${worst.at.slice(0, 10)})`);
}

console.log('');
