/**
 * Comprueba que un agente con herramientas MCP recuerda a un visitante que vuelve
 * en una conversacion nueva, y solo a ese.
 *
 * Turno 1 dice un dato en la sesion A. Turno 2 lo pregunta desde una sesion B
 * distinta con el mismo visitante: solo puede acertar si el recall tira del tag
 * de visitante. Turno 3 repite la pregunta con OTRO visitante y debe fallar; si
 * acertara, la memoria se estaria filtrando entre personas.
 *
 * Uso: node --env-file=.env scripts/probe-visitor-memory.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';

const LANDING = process.env.LANDING_URL || 'http://127.0.0.1:3201';
const DATO = '7734';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();

/**
 * El camino direct-mcp solo se activa si el agente tiene herramientas activas, y
 * hace falta un widget con token para entrar como lo haria el navegador. Se elige
 * el que menos herramientas tenga: el turno es mas rapido y barato.
 */
const widgets = await db
  .collection('widgets')
  .find({ active: { $ne: false } }, { projection: { agentId: 1, afhubToken: 1 } })
  .toArray();

let agente = null;
let token = '';
for (const w of widgets) {
  if (!w.afhubToken || !ObjectId.isValid(w.agentId)) continue;
  const c = await db
    .collection('clientagents')
    .findOne({ _id: new ObjectId(w.agentId) }, { projection: { name: 1, enabledMcpToolIds: 1 } });
  const tools = c?.enabledMcpToolIds?.length ?? 0;
  if (!tools) continue;
  if (!agente || tools < agente.enabledMcpToolIds.length) {
    agente = c;
    token = w.afhubToken;
  }
}

if (!agente) {
  console.error('Ningun widget apunta a un agente con herramientas MCP activas');
  process.exit(2);
}

const agentId = String(agente._id);
await client.close();

console.log(`agente "${agente.name}" con ${agente.enabledMcpToolIds.length} herramienta(s)\n`);

async function chat({ message, sessionId, visitorId }) {
  const res = await fetch(`${LANDING}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Widget-Token': token },
    body: JSON.stringify({ agentId, message, history: [], sessionId, visitorId, token }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, reply: String(json.reply ?? json.error ?? '') };
}

const sufijo = Date.now().toString(36);
const visitante = `vis_probe_${sufijo}`;
const otroVisitante = `vis_otro_${sufijo}`;

console.log(`### TURNO 1 — sesion A, visitante ${visitante}`);
const t1 = await chat({
  message: `Apunta este dato para mas adelante: mi numero de pedido es ${DATO}.`,
  sessionId: `sess_a_${sufijo}`,
  visitorId: visitante,
});
console.log(`  HTTP ${t1.status}: ${t1.reply.replace(/\s+/g, ' ').slice(0, 150)}\n`);

/** La memoria se escribe fire-and-forget y hay que esperar al embedding. */
await new Promise((r) => setTimeout(r, 6000));

console.log(`### TURNO 2 — sesion B (nueva), MISMO visitante`);
const t2 = await chat({
  message: 'Cual era mi numero de pedido? Responde solo la cifra.',
  sessionId: `sess_b_${sufijo}`,
  visitorId: visitante,
});
console.log(`  HTTP ${t2.status}: ${t2.reply.replace(/\s+/g, ' ').slice(0, 150)}\n`);

console.log(`### TURNO 3 — sesion C, OTRO visitante (no debe saberlo)`);
const t3 = await chat({
  message: 'Cual era mi numero de pedido? Responde solo la cifra.',
  sessionId: `sess_c_${sufijo}`,
  visitorId: otroVisitante,
});
console.log(`  HTTP ${t3.status}: ${t3.reply.replace(/\s+/g, ' ').slice(0, 150)}\n`);

const recuerda = t2.reply.includes(DATO);
const filtra = t3.reply.includes(DATO);

console.log(`recuerda al mismo visitante : ${recuerda ? 'SI' : 'NO'}`);
console.log(`se filtra a otro visitante  : ${filtra ? 'SI (mal)' : 'no'}`);
console.log(
  recuerda && !filtra
    ? '\nRESULTADO: memoria entre visitas correcta y acotada'
    : recuerda && filtra
      ? '\nRESULTADO: recuerda pero se filtra entre visitantes'
      : '\nRESULTADO: NO recuerda entre visitas',
);
