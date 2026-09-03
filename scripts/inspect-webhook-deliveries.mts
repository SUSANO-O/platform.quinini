/**
 * Últimas entregas de webhook desde la bitácora `webhookdeliveries`.
 * Solo lectura. No imprime URLs completas, secretos ni PII del lead.
 *
 *   npx tsx --env-file=.env scripts/inspect-webhook-deliveries.mts
 *   npx tsx --env-file=.env scripts/inspect-webhook-deliveries.mts --agent asesor-de-ventas
 *   npx tsx --env-file=.env scripts/inspect-webhook-deliveries.mts --fallidas
 *   npx tsx --env-file=.env scripts/inspect-webhook-deliveries.mts --limit 50
 */
import { createConnection } from 'mongoose';

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

const AGENT = arg('--agent');
const LIMIT = Number(arg('--limit') ?? 20);
const ONLY_FAILED = process.argv.includes('--fallidas');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Falta MONGODB_URI');

const c = await createConnection(uri).asPromise();
const col = c.db!.collection('webhookdeliveries');

const filter: Record<string, unknown> = {};
if (AGENT) filter.agentId = AGENT;
if (ONLY_FAILED) filter.ok = false;

const [total, rows] = await Promise.all([
  col.countDocuments(filter),
  col.find(filter).sort({ createdAt: -1 }).limit(LIMIT).toArray(),
]);

// Resumen por estado — lo primero que querés ver cuando "no llegan los leads".
const byStatus = new Map<string, number>();
for (const r of await col.find(filter).sort({ createdAt: -1 }).limit(500).toArray()) {
  const k = r.ok ? `ok_${r.status}` : `fallo_${r.statusText === 'exception' ? 'excepcion' : r.status}`;
  byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
}

console.log(
  JSON.stringify(
    {
      filtro: { agente: AGENT ?? '(todos)', soloFallidas: ONLY_FAILED },
      total,
      resumenUltimas500: Object.fromEntries([...byStatus].sort((a, b) => b[1] - a[1])),
      entregas: rows.map((r) => ({
        at: r.createdAt,
        agente: r.agentId,
        evento: r.event,
        webhook: r.webhookName ?? null,
        host: r.urlHost,
        intento: r.attempt,
        ok: r.ok,
        status: r.status,
        statusText: r.statusText ?? null,
        error: r.error ?? null,
        respuesta: typeof r.responseSnippet === 'string' ? r.responseSnippet.slice(0, 120) : null,
        ms: r.durationMs,
        // del lead solo decimos si venía, nunca el dato
        leadTraia: r.payload?.lead
          ? Object.entries(r.payload.lead)
              .filter(([, v]) => typeof v === 'string' && v.trim())
              .map(([k]) => k)
          : null,
      })),
    },
    null,
    2,
  ),
);

await c.close();
