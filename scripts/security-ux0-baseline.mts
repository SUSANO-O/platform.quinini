/**
 * UX-0: congela baseline de latencias (sin PII, sin URLs).
 *
 *   npx tsx --env-file=.env scripts/security-ux0-baseline.mts
 *   DAYS=14 npx tsx --env-file=.env scripts/security-ux0-baseline.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'mongoose';
import { computeLatencyStats } from '../src/lib/latency-baseline-stats';

const AGENT_ID = process.env.VENTAS_AGENT_ID?.trim() || '6a80f6a6543cb99549025dd2';
const HUB_ID = 'asesor-de-ventas';
const DAYS = Math.min(30, Math.max(1, parseInt(process.env.DAYS || '7', 10) || 7));
const MIN_OK = Math.max(1, parseInt(process.env.MIN_OK_SAMPLES || '10', 10) || 10);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../docs/security-phases/baselines');

async function main() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('Falta MONGODB_URI');

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const c = await createConnection(uri).asPromise();
  const col = c.db!.collection('widgetchatlatencies');

  const rows = await col
    .find({
      createdAt: { $gte: since },
      $or: [{ agentId: AGENT_ID }, { agentHubId: HUB_ID }],
    })
    .project({ totalMs: 1, ok: 1, path: 1, createdAt: 1, toolsUsed: 1 })
    .sort({ createdAt: -1 })
    .limit(2000)
    .toArray();

  const allMs = rows.map((r) => Number(r.totalMs) || 0);
  const okRows = rows.filter((r) => r.ok === true);
  const okMs = okRows.map((r) => Number(r.totalMs) || 0);
  const failCount = rows.length - okRows.length;

  const statsAll = computeLatencyStats(allMs);
  const statsOk = computeLatencyStats(okMs);

  const withTools = okRows.filter(
    (r) => Array.isArray(r.toolsUsed) && (r.toolsUsed as unknown[]).length > 0,
  );
  const chatOnly = okRows.filter(
    (r) => !Array.isArray(r.toolsUsed) || (r.toolsUsed as unknown[]).length === 0,
  );

  const iso = new Date().toISOString().slice(0, 10);
  const payload = {
    phase: 'UX-0',
    capturedAt: new Date().toISOString(),
    windowDays: DAYS,
    agentId: AGENT_ID,
    hubId: HUB_ID,
    sampleCount: rows.length,
    okCount: okRows.length,
    failCount,
    minOkRequired: MIN_OK,
    enoughSamples: okRows.length >= MIN_OK,
    statsOk,
    statsAll,
    statsOkWithTools: computeLatencyStats(withTools.map((r) => Number(r.totalMs) || 0)),
    statsOkChatOnly: computeLatencyStats(chatOnly.map((r) => Number(r.totalMs) || 0)),
    budget: {
      armorDeltaMs: 200,
      ux1RelativePct: 5,
    },
    gate: {
      unitTests: 'npx vitest run src/lib/__tests__/latency-baseline-stats.test.ts',
      nextPhase: okRows.length >= MIN_OK ? 'UX-1 eligible if PHASE-STATUS updated' : 'need more ok samples or run smoke',
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = resolve(OUT_DIR, `ux0-${iso}.json`);
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({ ok: true, outPath: outPath.replace(/.*\/docs\//, 'docs/'), ...payload }, null, 2));
  await c.close();

  if (!payload.enoughSamples) {
    console.error(
      `GATE_WARN: okCount=${okRows.length} < MIN_OK=${MIN_OK}. Corre smoke-ventas-lead.mts y re-ejecuta baseline.`,
    );
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
