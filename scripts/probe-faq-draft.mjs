/**
 * Comprueba que una pregunta del widget deja candidata a FAQ CON el borrador de
 * respuesta que dio el agente, que es lo que evita tener que reescribirla a mano.
 *
 * Uso: node --env-file=.env scripts/probe-faq-draft.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';
import { buildFaqAnswerSample, isReusableFaqAnswer } from '../src/lib/agent-faq-utils.ts';

const LANDING = process.env.LANDING_URL || 'http://127.0.0.1:3201';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();

const widgets = await db
  .collection('widgets')
  .find({ active: { $ne: false } }, { projection: { agentId: 1, afhubToken: 1 } })
  .toArray();

let agente = null;
let token = '';
for (const w of widgets) {
  if (!w.afhubToken?.startsWith('wt_') || !ObjectId.isValid(w.agentId)) continue;
  const c = await db
    .collection('clientagents')
    .findOne({ _id: new ObjectId(w.agentId) }, { projection: { name: 1, enabledMcpToolIds: 1 } });
  if (!c) continue;
  agente = c;
  token = w.afhubToken;
  break;
}

if (!agente) {
  console.error('No hay ningun widget con token wt_ apuntando a un agente');
  process.exit(2);
}

const agentId = String(agente._id);
console.log(`agente "${agente.name}"\n`);

/**
 * Pregunta natural a proposito: si lleva un identificador inventado el agente
 * contesta que no lo encuentra, y esa respuesta no sirve como FAQ. Si se agrupa
 * con la candidata de una ejecucion anterior no pasa nada: gana el ultimo
 * borrador bueno.
 */
const pregunta = 'Cuanto tarda el envio de un pedido a provincias?';

const res = await fetch(`${LANDING}/api/widget/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Widget-Token': token },
  body: JSON.stringify({
    agentId,
    message: pregunta,
    history: [],
    sessionId: `sess_faq_${Date.now().toString(36)}`,
    token,
  }),
});

const json = await res.json().catch(() => ({}));
console.log(`HTTP ${res.status}`);
console.log(`respuesta completa:\n  ${String(json.reply ?? json.error ?? '').replace(/\s+/g, ' ')}\n`);

/** Se evalua aqui tambien para distinguir "filtro lo descarto" de "no llego". */
const respuesta = String(json.reply ?? '');
console.log(`el filtro la acepta : ${isReusableFaqAnswer(respuesta)}`);
console.log(`borrador que saldria: ${buildFaqAnswerSample(respuesta).slice(0, 90) || '(vacio)'}\n`);

/** El tracker corre fire-and-forget despues de responder. */
await new Promise((r) => setTimeout(r, 4000));

const fresco = await db
  .collection('clientagents')
  .findOne({ _id: new ObjectId(agentId) }, { projection: { faqCandidates: 1 } });

/** La mas reciente, no cualquiera que hable de envios de ejecuciones pasadas. */
const candidata = (fresco?.faqCandidates ?? [])
  .filter((c) => String(c.questionSample ?? '').includes('provincias'))
  .sort((a, b) => String(b.lastSeen ?? '').localeCompare(String(a.lastSeen ?? '')))[0];

if (!candidata) {
  console.log('RESULTADO: no se registro ninguna candidata');
} else {
  console.log(`candidata registrada (x${candidata.count})`);
  console.log(`  pregunta : ${candidata.questionSample}`);
  console.log(`  borrador : ${(candidata.answerSample ?? '(vacio)').slice(0, 200)}`);
  console.log(
    candidata.answerSample?.trim()
      ? '\nRESULTADO: la candidata trae borrador de respuesta'
      : '\nRESULTADO: candidata SIN borrador',
  );
}

await client.close();
