/**
 * Prueba completa del RAG del panel: indexa un documento con un dato inventado
 * y le pregunta al agente por ese dato a traves del widget.
 *
 * Si lo dice, solo puede venir del documento.
 *
 * Uso: npx tsx --env-file=.env scripts/probe-rag-chat.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';
import { indexRagSourceEmbeddings } from '../src/lib/rag-embeddings-index.ts';

const LANDING = process.env.LANDING_URL || 'http://127.0.0.1:3201';
const BASE_LANDING = 'agentflowhub_landing';
const BASE_MOTOR = 'agentflow';
const CLAVE = 'ZR-4419';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const landing = client.db(BASE_LANDING);
const vectores = client.db(BASE_MOTOR).collection('vector_embeddings');

/** Un widget cuyo agente NO tenga MCP: ese es el que cae en inferencia directa. */
const widgets = await landing
  .collection('widgets')
  .find({ active: { $ne: false } }, { projection: { agentId: 1, afhubToken: 1 } })
  .toArray();

let agente = null;
let token = '';
for (const w of widgets) {
  if (!w.afhubToken?.startsWith('wt_') || !ObjectId.isValid(w.agentId)) continue;
  const c = await landing.collection('clientagents').findOne(
    { _id: new ObjectId(w.agentId) },
    { projection: { name: 1, agentHubId: 1, enabledMcpToolIds: 1, ragEnabled: 1 } },
  );
  if (!c?.agentHubId) continue;
  if (c.enabledMcpToolIds?.length) continue;
  agente = c;
  token = w.afhubToken;
  break;
}

if (!agente) {
  console.error('No hay ningun widget con agente sin MCP y sincronizado');
  process.exit(2);
}

const agentId = String(agente._id);
console.log(`agente "${agente.name}" (hub: ${agente.agentHubId}) ragEnabled=${agente.ragEnabled === true}\n`);

const nombreDoc = `politica-garantia-prueba-${Date.now().toString(36)}.txt`;
const contenido = [
  'Politica interna de garantia extendida de la empresa.',
  `El codigo de tramite para solicitar una garantia extendida es ${CLAVE}.`,
  'La garantia extendida cubre 37 meses desde la fecha de compra.',
].join('\n');

const idx = await indexRagSourceEmbeddings({
  agentHubId: agente.agentHubId,
  fileName: nombreDoc,
  content: contenido,
});
console.log(`indexado: ${idx.ok ? `si, ${idx.chunks} fragmento(s)` : `NO — ${idx.error}`}`);

/** El RAG hay que tenerlo activo para que el camino directo lo consulte. */
const yaActivo = agente.ragEnabled === true;
if (!yaActivo) {
  await landing.collection('clientagents').updateOne({ _id: agente._id }, { $set: { ragEnabled: true } });
  console.log('ragEnabled activado temporalmente para la prueba');
}

const res = await fetch(`${LANDING}/api/widget/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Widget-Token': token },
  body: JSON.stringify({
    agentId,
    message: 'Cual es el codigo de tramite para una garantia extendida?',
    history: [],
    sessionId: `sess_rag_${Date.now().toString(36)}`,
    token,
  }),
});

const json = await res.json().catch(() => ({}));
const reply = String(json.reply ?? json.error ?? '');
console.log(`\nHTTP ${res.status}`);
console.log(`respuesta: ${reply.replace(/\s+/g, ' ').slice(0, 300)}`);
console.log(
  reply.includes(CLAVE)
    ? `\nRESULTADO: el agente cita ${CLAVE}, viene del documento`
    : `\nRESULTADO: el agente NO cita ${CLAVE}`,
);

/** Limpieza: datos reales. */
await vectores.deleteMany({ agentId: agente.agentHubId, 'metadata.sourceFile': nombreDoc });
if (!yaActivo) {
  await landing.collection('clientagents').updateOne({ _id: agente._id }, { $set: { ragEnabled: false } });
}
console.log('\nlimpiado');

await client.close();
process.exit(0);
