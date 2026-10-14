/**
 * Prueba de "temperatura" de Mongo: arranque en frío vs caliente con las opciones reales de prod.
 *
 * Cada corrida es un proceso nuevo (= instancia nueva de Vercel): conecta con
 * `mongoServerlessOptions()` simulando VERCEL=1 (pool de 1 socket), carga los modelos y mide
 * 8 queries de lectura típicas del chat en frío y luego en caliente. Compara con
 * autoIndex/autoCreate encendidos (cómo estaba prod) para ver la cola que generan.
 * Solo lecturas (findOne). Con autoIndex encendido, Mongoose re-emite createIndexes
 * de índices ya existentes: no cambia nada en la base.
 *
 * Uso: npm run bench:db-cold [-- --runs 3]
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODELS = ['Widget', 'Subscription', 'ClientAgent', 'ConversationSession', 'WidgetMessage', 'WidgetSessionContext', 'InferenceMetric', 'User'];

async function child(variant) {
  process.env.VERCEL = '1';
  const mongoose = (await import('mongoose')).default;
  const { mongoServerlessOptions } = await import('../../src/lib/db/connection.ts');
  const opts = { ...mongoServerlessOptions(), monitorCommands: true };
  if (variant === 'auto') Object.assign(opts, { autoIndex: true, autoCreate: true });
  const t0 = performance.now();
  await mongoose.connect(process.env.MONGODB_URI, opts);
  const connMs = performance.now() - t0;
  const cmds = {};
  mongoose.connection.getClient().on('commandStarted', (e) => { cmds[e.commandName] = (cmds[e.commandName] ?? 0) + 1; });
  const m = await import('../../src/lib/db/models.ts');
  const round = async () => {
    let total = 0;
    for (const n of MODELS.filter((x) => m[x])) {
      const s = performance.now();
      await m[n].findOne({}).select({ _id: 1 }).lean();
      total += performance.now() - s;
    }
    return Math.round(total);
  };
  const cold = await round();
  await new Promise((r) => setTimeout(r, 2000));
  const warm = await round();
  console.log(JSON.stringify({ variant, connMs: Math.round(connMs), cold, warm, cmds }));
  await mongoose.disconnect();
}

if (process.argv[2] === '--child') {
  await child(process.argv[3]);
} else {
  const ri = process.argv.indexOf('--runs');
  const runs = ri > 0 ? Number(process.argv[ri + 1]) || 3 : 3;
  const self = fileURLToPath(import.meta.url);
  const rows = [];
  for (let i = 0; i < runs; i++) {
    for (const variant of ['prod', 'auto']) {
      const r = spawnSync(process.execPath, ['--no-warnings', self, '--child', variant], { env: process.env, encoding: 'utf8' });
      const line = r.stdout.trim().split('\n').pop();
      if (r.status !== 0 || !line?.startsWith('{')) { console.error(r.stderr || r.stdout); process.exit(1); }
      rows.push(JSON.parse(line));
    }
  }
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  for (const variant of ['prod', 'auto']) {
    const v = rows.filter((r) => r.variant === variant);
    const c = v[0].cmds;
    console.log(
      `${variant === 'prod' ? 'config actual (prod)      ' : 'autoIndex/autoCreate on  '}` +
      ` frío ${String(med(v.map((r) => r.cold))).padStart(6)} ms | caliente ${String(med(v.map((r) => r.warm))).padStart(5)} ms` +
      ` | órdenes extra: ${(c.create ?? 0) + (c.createIndexes ?? 0)} (n=${v.length})`,
    );
  }
  const prod = rows.filter((r) => r.variant === 'prod');
  const coldRatio = med(prod.map((r) => r.cold)) / Math.max(1, med(prod.map((r) => r.warm)));
  console.log(coldRatio < 2 ? 'OK: en frío cuesta lo mismo que en caliente.' : `ALERTA: frío ${coldRatio.toFixed(1)}x caliente — algo se encola al arrancar.`);
  process.exit(coldRatio < 2 ? 0 : 1);
}
