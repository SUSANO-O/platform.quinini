/**
 * Cruza los documentos que el panel dice que tiene un agente (ragSources) con los
 * vectores realmente indexados, que son los unicos que el RAG consulta.
 *
 * Uso: node --env-file=.env scripts/inspect-rag-indexed.mjs
 */
import { MongoClient } from 'mongodb';

/** Landing y motor comparten cluster pero no base: los vectores estan en la del motor. */
const BASE_LANDING = process.env.LANDING_DB_NAME || 'agentflowhub_landing';
const BASE_MOTOR = process.env.AIBACKHUB_DB_NAME || 'agentflow';

const landing = new MongoClient(process.env.MONGODB_URI);
await landing.connect();
const db = landing.db(BASE_LANDING);

const agentes = await db
  .collection('clientagents')
  .find(
    { ragSources: { $exists: true, $ne: [] } },
    { projection: { name: 1, ragEnabled: 1, ragSources: 1, agentHubId: 1 } },
  )
  .toArray();

console.log(`agentes con documentos en el panel: ${agentes.length}\n`);

const vectores = landing.db(BASE_MOTOR).collection('vector_embeddings');
const totalChunks = await vectores.countDocuments({ 'metadata.type': { $in: ['chunk', 'document'] } });
console.log(`vectores de documentos en "${BASE_MOTOR}": ${totalChunks}\n`);

let sinIndexar = 0;

for (const a of agentes) {
  const docs = Array.isArray(a.ragSources) ? a.ragSources : [];
  const ids = [String(a._id), a.agentHubId].filter(Boolean);
  const n = await vectores.countDocuments({
    agentId: { $in: ids },
    'metadata.type': { $in: ['chunk', 'document'] },
  });
  if (n === 0) sinIndexar += 1;
  console.log(
    `  ${String(a.name).slice(0, 30).padEnd(32)} docs=${String(docs.length).padStart(2)} ragEnabled=${a.ragEnabled === true ? 'si' : 'no '} vectores=${n}${n === 0 ? '  <- nada que consultar' : ''}`,
  );
}

console.log(
  `\n${sinIndexar} de ${agentes.length} agentes tienen documentos guardados pero ningun vector indexado`,
);

/** Los chunks que existen, para ver a que agentes pertenecen realmente. */
const duenos = await vectores
  .aggregate([
    { $match: { 'metadata.type': { $in: ['chunk', 'document'] } } },
    { $group: { _id: '$agentId', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ])
  .toArray();

console.log('\nvectores de documentos por agente:');
for (const d of duenos) console.log(`  ${String(d._id).padEnd(30)} ${d.n}`);

await landing.close();
