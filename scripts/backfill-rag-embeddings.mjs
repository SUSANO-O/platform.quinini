/**
 * Indexa los documentos que ya estaban subidos en el panel y nunca se
 * vectorizaron. Solo toca lo que falta: consulta que documentos tiene ya
 * indexados cada agente y sube unicamente los ausentes, asi que se puede
 * repetir sin duplicar vectores.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-rag-embeddings.mjs                    (simulacion)
 *   npx tsx --env-file=.env scripts/backfill-rag-embeddings.mjs --aplicar
 *   npx tsx --env-file=.env scripts/backfill-rag-embeddings.mjs --aplicar --agente=Taller
 *   npx tsx --env-file=.env scripts/backfill-rag-embeddings.mjs --aplicar --agente=Math-ais --forzar
 */
import { MongoClient } from 'mongodb';
import { indexRagSourceEmbeddings, ragSourceFileName } from '../src/lib/rag-embeddings-index.ts';

const APLICAR = process.argv.includes('--aplicar');
/** Reindexa aunque Mongo ya tenga el archivo: sirve si Pinecone rechazo el ID. */
const FORZAR = process.argv.includes('--forzar');
/** Para acotar a un agente concreto antes de lanzarlo sobre todos. */
const FILTRO = (process.argv.find((a) => a.startsWith('--agente=')) ?? '').slice('--agente='.length).trim();
const BASE_LANDING = 'agentflowhub_landing';

const base = (process.env.BACKEND_URL || 'http://127.0.0.1:9003').replace(/\/$/, '');
const cabeceras = {};
if (process.env.AIBACKHUB_API_KEY) cabeceras['x-api-key'] = process.env.AIBACKHUB_API_KEY;
if (process.env.AIBACKHUB_TENANT_ID) cabeceras['x-tenant-id'] = process.env.AIBACKHUB_TENANT_ID;

/** Nombres ya indexados en el motor, para no volver a subirlos. */
async function yaIndexados(agentHubId) {
  try {
    const res = await fetch(`${base}/api/embeddings/files/${encodeURIComponent(agentHubId)}`, {
      headers: cabeceras,
    });
    if (!res.ok) return new Set();
    const json = await res.json().catch(() => ({}));
    const files = json?.data?.files ?? [];
    return new Set(
      files.map((f) => String(typeof f === 'string' ? f : (f.sourceFile ?? f.fileName ?? ''))).filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const landing = client.db(BASE_LANDING);

const agentes = await landing
  .collection('clientagents')
  .find(
    { ragSources: { $exists: true, $ne: [] }, agentHubId: { $type: 'string', $ne: '' } },
    { projection: { name: 1, agentHubId: 1, ragSources: 1 } },
  )
  .toArray();

console.log(APLICAR ? 'MODO REAL\n' : 'SIMULACION (usa --aplicar para indexar)\n');

let pendientes = 0;
let indexados = 0;
let fallos = 0;

for (const a of agentes) {
  if (FILTRO && !String(a.name ?? '').toLowerCase().includes(FILTRO.toLowerCase())) continue;

  const docs = (Array.isArray(a.ragSources) ? a.ragSources : []).filter(
    (s) => typeof s?.content === 'string' && s.content.trim(),
  );
  if (!docs.length) continue;

  const existentes = FORZAR ? new Set() : await yaIndexados(a.agentHubId);
  const faltan = docs.filter((d) => !existentes.has(ragSourceFileName(String(d.name ?? 'documento'))));

  if (!faltan.length) {
    console.log(`${String(a.name).slice(0, 28).padEnd(30)} ${docs.length} doc(s), todos indexados`);
    continue;
  }

  pendientes += faltan.length;
  console.log(`${String(a.name).slice(0, 28).padEnd(30)} ${docs.length} doc(s), faltan ${faltan.length}`);

  if (!APLICAR) continue;

  for (const d of faltan) {
    const nombre = String(d.name ?? 'documento');
    const r = await indexRagSourceEmbeddings({
      agentHubId: a.agentHubId,
      fileName: nombre,
      content: String(d.content),
    });
    if (r.ok) {
      indexados += 1;
      console.log(`    ok  ${nombre.slice(0, 50)} (${r.chunks} fragmento/s)`);
    } else {
      fallos += 1;
      console.log(`    ERR ${nombre.slice(0, 50)} — ${r.error}`);
    }
  }
}

console.log(
  APLICAR
    ? `\n${indexados} documento(s) indexados, ${fallos} fallo(s)`
    : `\n${pendientes} documento(s) sin indexar`,
);

await client.close();
process.exit(0);
