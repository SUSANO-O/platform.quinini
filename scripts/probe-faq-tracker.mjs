/**
 * Llama al tracker de candidatas directamente, sin pasar por la ruta de chat.
 *
 * Aisla si el borrador se pierde en el tracker o en el camino que lo invoca.
 *
 * Uso: npx tsx --env-file=.env scripts/probe-faq-tracker.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';
import { connectDB } from '../src/lib/db/connection.ts';
import { trackWidgetUserMessageForFaqCandidates } from '../src/lib/widget-faq-tracker.ts';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();

/** Algunos widgets antiguos guardan un slug en agentId, no un ObjectId. */
const widgets = await db
  .collection('widgets')
  .find({ active: { $ne: false } }, { projection: { agentId: 1 } })
  .toArray();

let agente = null;
for (const w of widgets) {
  if (!ObjectId.isValid(w.agentId)) continue;
  agente = await db
    .collection('clientagents')
    .findOne({ _id: new ObjectId(w.agentId) }, { projection: { name: 1, userId: 1 } });
  if (agente) break;
}

console.log(`agente "${agente.name}"`);

const pregunta = 'Cual es el horario de atencion al cliente los sabados?';
const respuesta =
  'Atendemos de lunes a viernes de 9 a 18 horas y los sabados de 10 a 14 horas, hora peninsular.';

await connectDB();
await trackWidgetUserMessageForFaqCandidates({
  ownerUserId: String(agente.userId),
  agentIdOrHubId: String(agente._id),
  rawBody: JSON.stringify({ message: pregunta }),
  agentReply: respuesta,
});

const fresco = await db
  .collection('clientagents')
  .findOne({ _id: agente._id }, { projection: { faqCandidates: 1 } });

const c = (fresco?.faqCandidates ?? []).find((x) =>
  String(x.questionSample ?? '').includes('sabados'),
);

console.log(`\ncandidata : ${c ? `x${c.count} — ${c.questionSample}` : '(no registrada)'}`);
console.log(`borrador  : ${c?.answerSample ?? '(vacio)'}`);

await client.close();
process.exit(0);
