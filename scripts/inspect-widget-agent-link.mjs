/**
 * Muestra como se enlazan widgets y agentes en la base local, sin exponer tokens.
 *
 * Uso: node --env-file=.env scripts/inspect-widget-agent-link.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();

const cols = (await db.listCollections().toArray()).map((c) => c.name).sort();
console.log(`colecciones: ${cols.join(', ')}\n`);

const widgets = await db
  .collection('widgets')
  .find({}, { projection: { agentId: 1, name: 1, isActive: 1 } })
  .toArray();

console.log(`widgets: ${widgets.length}`);
for (const w of widgets) {
  /** widgets.agentId es el _id del clientagent en hexadecimal, no un ObjectId. */
  if (!ObjectId.isValid(w.agentId)) {
    console.log(`  widget=${w.name ?? '-'} agentId=${w.agentId} -> id no valido`);
    continue;
  }
  const agente = await db
    .collection('clientagents')
    .findOne({ _id: new ObjectId(w.agentId) }, { projection: { name: 1, enabledMcpToolIds: 1 } });
  const tools = agente?.enabledMcpToolIds?.length ?? 0;
  console.log(
    `  widget=${String(w.name ?? '-').padEnd(34)} -> ${String(agente?.name ?? 'SIN MATCH').padEnd(26)} tools=${tools}`,
  );
}

await client.close();
