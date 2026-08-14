/**
 * Sube un documento por la misma via que el panel y comprueba que queda
 * indexado y que el agente lo puede recuperar.
 *
 * El dato es inventado a proposito: si el agente lo dice, solo puede venir del
 * documento, no de lo que sabe el modelo.
 *
 * Uso: npx tsx --env-file=.env scripts/probe-rag-upload.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';
import { indexRagSourceEmbeddings } from '../src/lib/rag-embeddings-index.ts';

const BASE_LANDING = 'agentflowhub_landing';
const BASE_MOTOR = 'agentflow';
const CLAVE = 'ZR-4419';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const landing = client.db(BASE_LANDING);
const vectores = client.db(BASE_MOTOR).collection('vector_embeddings');

/** Un agente ya sincronizado con el hub: sin agentHubId no hay donde indexar. */
const agente = await landing.collection('clientagents').findOne(
  { agentHubId: { $type: 'string', $ne: '' }, isPlatform: { $ne: true } },
  { projection: { name: 1, agentHubId: 1 } },
);

if (!agente) {
  console.error('No hay ningun agente sincronizado con el hub');
  process.exit(2);
}

console.log(`agente "${agente.name}" (hub: ${agente.agentHubId})\n`);

const nombreDoc = `politica-garantia-prueba-${Date.now().toString(36)}.txt`;
const contenido = [
  'Politica interna de garantia extendida.',
  `El codigo de tramite para una garantia extendida es ${CLAVE}.`,
  'Las garantias extendidas cubren 37 meses desde la fecha de compra.',
  'Solo aplica a equipos registrados en el portal de clientes.',
].join('\n');

const antes = await vectores.countDocuments({
  agentId: agente.agentHubId,
  'metadata.type': { $in: ['chunk', 'document'] },
});

const res = await indexRagSourceEmbeddings({
  agentHubId: agente.agentHubId,
  fileName: nombreDoc,
  content: contenido,
});

console.log(`indexado: ${res.ok ? `si, ${res.chunks} fragmento(s)` : `NO — ${res.error}`}`);

const despues = await vectores.countDocuments({
  agentId: agente.agentHubId,
  'metadata.type': { $in: ['chunk', 'document'] },
});
console.log(`vectores del agente: ${antes} -> ${despues}\n`);

/** Recuperacion real, tal como la haria el motor al responder. */
const base = (process.env.BACKEND_URL || 'http://127.0.0.1:9003').replace(/\/$/, '');
const cabeceras = { 'Content-Type': 'application/json' };
if (process.env.AIBACKHUB_API_KEY) cabeceras['x-api-key'] = process.env.AIBACKHUB_API_KEY;
if (process.env.AIBACKHUB_TENANT_ID) cabeceras['x-tenant-id'] = process.env.AIBACKHUB_TENANT_ID;

const q = await fetch(`${base}/api/embeddings/rag`, {
  method: 'POST',
  headers: cabeceras,
  body: JSON.stringify({
    agentId: agente.agentHubId,
    query: 'cual es el codigo de tramite de la garantia extendida',
    topK: 3,
  }),
});

const qj = await q.json().catch(() => ({}));
const texto = JSON.stringify(qj);
console.log(`consulta RAG: HTTP ${q.status}`);
console.log(`  encuentra ${CLAVE}: ${texto.includes(CLAVE) ? 'SI' : 'no'}`);

console.log(
  texto.includes(CLAVE)
    ? '\nRESULTADO: el documento subido es recuperable'
    : '\nRESULTADO: el documento NO se recupera',
);

/** Limpieza: es un documento de prueba en datos reales. */
await vectores.deleteMany({ agentId: agente.agentHubId, 'metadata.sourceFile': nombreDoc });
console.log(`\nlimpiado ${nombreDoc}`);

await client.close();
process.exit(0);
