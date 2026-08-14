/**
 * Comprueba que los documentos ya indexados de un agente se recuperan.
 *
 * Uso: npx tsx --env-file=.env scripts/probe-rag-recall.mjs Taller
 */
import { MongoClient } from 'mongodb';
import { retrieveRagContextBlock } from '../src/lib/rag-embeddings-index.ts';

const filtro = process.argv[2] || '';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();

const agente = await client
  .db('agentflowhub_landing')
  .collection('clientagents')
  .findOne(
    { name: new RegExp(filtro, 'i'), agentHubId: { $type: 'string', $ne: '' } },
    { projection: { name: 1, agentHubId: 1, ragSources: 1 } },
  );

if (!agente) {
  console.error(`No hay agente que coincida con "${filtro}"`);
  process.exit(2);
}

const doc = String(agente.ragSources?.[0]?.content ?? '');
console.log(`agente "${agente.name}" (hub: ${agente.agentHubId})`);
console.log(`documento: ${doc.replace(/\s+/g, ' ').slice(0, 160)}\n`);

/** Se pregunta con palabras del propio documento, que es lo que deberia casar. */
const consulta = doc
  .replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ ]/g, ' ')
  .split(/\s+/)
  .filter((w) => w.length > 6)
  .slice(0, 6)
  .join(' ');

console.log(`consulta: ${consulta}`);

const bloque = await retrieveRagContextBlock({ agentHubId: agente.agentHubId, query: consulta });
console.log(`\nrecuperado: ${bloque ? bloque.replace(/\s+/g, ' ').slice(0, 240) : '(nada)'}`);
console.log(bloque ? '\nRESULTADO: el documento es consultable' : '\nRESULTADO: no se recupera nada');

await client.close();
process.exit(0);
