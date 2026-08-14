/**
 * Muestra que camino sirvio cada chat del widget (direct-mcp, infer-direct, hub...).
 *
 * Uso: node --env-file=.env scripts/inspect-chat-path.mjs [minutos]
 */
import { MongoClient } from 'mongodb';

const minutes = Number(process.argv[2] || 30);
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Falta MONGODB_URI');
  process.exit(2);
}

const since = new Date(Date.now() - minutes * 60_000);
const client = new MongoClient(uri);
await client.connect();
const db = client.db();

const metrics = await db
  .collection('inferencemetrics')
  .find(
    { createdAt: { $gte: since } },
    { projection: { path: 1, sessionId: 1, agentId: 1, createdAt: 1, ok: 1 } },
  )
  .sort({ createdAt: -1 })
  .toArray();

console.log(`inferencemetrics ultimos ${minutes} min: ${metrics.length}`);
for (const r of metrics) {
  console.log(
    `  ${r.createdAt?.toISOString?.()}  path=${(r.path || '?').padEnd(20)} agente=${r.agentId}  sesion=${r.sessionId ?? '-'}`,
  );
}

const lat = await db
  .collection('widgetchatlatencies')
  .find({}, { projection: { path: 1, traceId: 1, createdAt: 1, totalMs: 1 } })
  .sort({ createdAt: -1 })
  .limit(8)
  .toArray();

console.log(`\nwidgetchatlatencies (ultimos 8):`);
for (const r of lat) {
  console.log(`  ${r.createdAt?.toISOString?.()}  path=${r.path ?? '-'}`);
}

await client.close();
