/**
 * Banco de pruebas de seguridad — runner.
 *
 * Lanza las sondas NO destructivas de `src/lib/security/probe-cases.ts` contra la infraestructura
 * de BotIvA y reporta PASA/FALLA. No borra ni modifica datos, no hace fuerza bruta, no satura.
 *
 * Uso:
 *   LANDING_URL=https://botiva.space \
 *   HUB_URL=https://control-matias-528082765109.europe-west1.run.app \
 *   BACKEND_URL=https://matias-backend-528082765109.europe-west1.run.app \
 *   npx tsx scripts/security/run-security-probe.mts [--only=<id,...>] [--target=landing|hub|backend]
 *
 * Sale con código 1 si falla alguna sonda crítica (útil en CI o tras un deploy).
 */

import {
  SECURITY_PROBES,
  evaluateProbeResponse,
  summarizeProbeRun,
  type ProbeCase,
  type ProbeResult,
  type ProbeTarget,
} from '../../src/lib/security/probe-cases.ts';

const BASES: Record<ProbeTarget, string | undefined> = {
  landing: process.env.LANDING_URL,
  hub: process.env.HUB_URL,
  backend: process.env.BACKEND_URL,
};

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const targetArg = args.find((a) => a.startsWith('--target='))?.slice('--target='.length) as ProbeTarget | undefined;
const onlyIds = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim())) : null;

const SEV_ICON: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', info: '🟢' };

async function runProbe(probe: ProbeCase): Promise<ProbeResult> {
  const base = BASES[probe.target];
  if (!base) {
    return { probe, status: 0, ok: false, reasons: [`falta la URL del target "${probe.target}" (env ${probe.target.toUpperCase()}_URL)`] };
  }
  const url = `${base.replace(/\/$/, '')}${probe.path}`;
  const headers: Record<string, string> = { ...(probe.headers ?? {}) };
  let body: string | undefined;
  if (probe.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(probe.body);
  }
  try {
    const res = await fetch(url, { method: probe.method, headers, body, signal: AbortSignal.timeout(30_000) });
    const text = (await res.text()).slice(0, 20_000);
    return evaluateProbeResponse(probe, res.status, text);
  } catch (err) {
    return { probe, status: 0, ok: false, reasons: [`error de red: ${(err as Error).message}`] };
  }
}

async function main() {
  const selected = SECURITY_PROBES.filter(
    (p) => (!onlyIds || onlyIds.has(p.id)) && (!targetArg || p.target === targetArg),
  );
  if (selected.length === 0) {
    console.error('No hay sondas que correr con esos filtros.');
    process.exit(2);
  }

  console.log(`Banco de seguridad — ${selected.length} sondas\n`);
  const results: ProbeResult[] = [];
  // Secuencial y suave: no es un ataque de carga.
  for (const probe of selected) {
    const r = await runProbe(probe);
    results.push(r);
    const mark = r.ok ? '✅' : '❌';
    console.log(`${mark} ${SEV_ICON[probe.severity]} ${probe.id}  (HTTP ${r.status})  ${probe.description}`);
    if (!r.ok) {
      for (const reason of r.reasons) console.log(`      ↳ ${reason}`);
      console.log(`      ↳ por qué importa: ${probe.rationale}`);
    }
  }

  const sum = summarizeProbeRun(results);
  console.log(`\nResultado: ${sum.passed}/${sum.total} pasan · ${sum.failed} fallan · ${sum.failedCritical} críticas`);
  if (sum.failedCritical > 0) {
    console.log('⚠️  Hay sondas CRÍTICAS en rojo: un hueco de seguridad está abierto.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
