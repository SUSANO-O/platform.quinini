/**
 * Auditoria conversacional del agente de taller: memoria corta, larga, RAG,
 * tono emocional y latencia. Habla por el mismo endpoint del widget.
 *
 * Uso: npx tsx --env-file=.env scripts/audit-taller-memory.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';
import { writeFileSync } from 'node:fs';

const LANDING = process.env.LANDING_URL || 'http://127.0.0.1:3201';
const BASE_LANDING = 'agentflowhub_landing';
const stamp = Date.now().toString(36);
const visitorA = `vis_audit_${stamp}`;
const visitorB = `vis_other_${stamp}`;
const sessA = `sess_a_${stamp}`;
const sessB = `sess_b_${stamp}`;
const sessC = `sess_c_${stamp}`;

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const landing = client.db(BASE_LANDING);

const widgets = await landing
  .collection('widgets')
  .find({ active: { $ne: false } }, { projection: { agentId: 1, afhubToken: 1, name: 1 } })
  .toArray();

let agente = null;
let token = '';
let widgetName = '';
for (const w of widgets) {
  if (!w.afhubToken?.startsWith('wt_') || !ObjectId.isValid(w.agentId)) continue;
  const c = await landing.collection('clientagents').findOne(
    { _id: new ObjectId(w.agentId) },
    { projection: { name: 1, agentHubId: 1, ragEnabled: 1, enabledMcpToolIds: 1, model: 1 } },
  );
  if (!c) continue;
  if (!/taller/i.test(String(c.name))) continue;
  agente = c;
  token = w.afhubToken;
  widgetName = String(w.name || '');
  break;
}

if (!agente) {
  console.error('No se encontro el agente de taller con widget wt_');
  process.exit(2);
}

const agentId = String(agente._id);
console.log(`agente "${agente.name}" hub=${agente.agentHubId} rag=${agente.ragEnabled === true} widget=${widgetName}\n`);

const history = [];
const turns = [];

function mentions(text, needles) {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return needles.map((n) => {
    const nrm = n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return { needle: n, hit: t.includes(nrm) };
  });
}

async function speak(opts) {
  const { id, axis, message, sessionId, visitorId, expect, historyForCall } = opts;
  const t0 = Date.now();
  const res = await fetch(`${LANDING}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Widget-Token': token },
    body: JSON.stringify({
      agentId,
      message,
      history: historyForCall,
      sessionId,
      visitorId,
      token,
    }),
  });
  const ms = Date.now() - t0;
  const json = await res.json().catch(() => ({}));
  const reply = String(json.reply ?? json.error ?? '');
  const hits = mentions(reply, expect);
  const hitCount = hits.filter((h) => h.hit).length;
  const score = expect.length ? Math.round((hitCount / expect.length) * 100) : (res.ok ? 100 : 0);

  const row = {
    id,
    axis,
    sessionId,
    visitorId,
    http: res.status,
    ms,
    message,
    reply: reply.replace(/\s+/g, ' ').slice(0, 900),
    expect,
    hits,
    score,
    path: json.path || json.meta?.path || null,
  };
  turns.push(row);
  console.log(`\n[${id}] ${axis}  ${ms}ms  HTTP ${res.status}  score ${score}%`);
  console.log(`  U: ${message}`);
  console.log(`  A: ${row.reply.slice(0, 280)}`);
  return reply;
}

async function turn(id, axis, message, sessionId, visitorId, expect) {
  const reply = await speak({
    id,
    axis,
    message,
    sessionId,
    visitorId,
    expect,
    historyForCall: [...history],
  });
  history.push({ role: 'user', content: message });
  if (reply) history.push({ role: 'assistant', content: reply });
  return reply;
}

/** Sesion A: conversacion natural + memoria corta + RAG + emocion. */
await turn(
  'A1',
  'apertura',
  'Hola, buenas tardes. Ando un poco perdido con el tema del carro.',
  sessA,
  visitorA,
  ['hola', 'ayud', 'taller', 'asesor', 'carro', 'auto', 'vehiculo'],
);

await turn(
  'A2',
  'memoria-corta-escritura',
  'Me llamo Andres. Tengo un Picanto blanco del 2019 con 42000 kilometros y quiero cambiarlo por algo mas nuevo.',
  sessA,
  visitorA,
  ['andres', 'picanto', 'blanco', '42000', '42.000', '42 mil', '2019'],
);

await turn(
  'A3',
  'rag-inventario',
  'Que Kia Picanto 2026 tienen en el inventario premium de MatIAs Auto Sales en Bogota?',
  sessA,
  visitorA,
  ['picanto', 'kia', 'bogota', 'matias', '2026', 'inventario'],
);

await turn(
  'A4',
  'emocional',
  'La verdad estoy muy angustiado. El carro se me apaga en los semaforos y tengo que llevar a mi hija al colegio todas las mananas. Tengo miedo de que nos dejemos tirados.',
  sessA,
  visitorA,
  ['hija', 'entiendo', 'tranqui', 'ayuda', 'revision', 'seguro', 'colegio', 'angust', 'preocup'],
);

await turn(
  'A5',
  'memoria-corta-lectura',
  'Oye, cuantos kilometros te dije que tenia mi carro, y de que color era?',
  sessA,
  visitorA,
  ['42000', '42.000', '42 mil', 'blanco'],
);

await turn(
  'A6',
  'razonamiento',
  'Si el Picanto nuevo del inventario vale lo que ustedes manejan, y el mio es 2019 con esos kilometros, mas o menos cuanto me faltaria para el cambio? Razona en voz alta, no inventes un precio si no lo tienes.',
  sessA,
  visitorA,
  ['2019', 'kilomet', 'falt', 'diferencia', 'no tengo', 'precio', 'inventario', 'tasacion', 'avaluo'],
);

await turn(
  'A7',
  'referencia-implicita',
  'Y el de color que te comente al inicio, sigue siendo el que quiero entregar?',
  sessA,
  visitorA,
  ['blanco', 'picanto', 'andres', 'usado'],
);

/** Sesion B: mismo visitante, historial vacio. Memoria larga entre visitas. */
history.length = 0;
await speak({
  id: 'B1',
  axis: 'memoria-larga',
  message: 'Hola de nuevo. Te acuerdas de mi nombre y del carro que queria cambiar?',
  sessionId: sessB,
  visitorId: visitorA,
  expect: ['andres', 'picanto', 'blanco', '2019', '42000', '42'],
  historyForCall: [],
});

await speak({
  id: 'B2',
  axis: 'memoria-larga-hija',
  message: 'Tambien te conte por que tenia prisa. Recuerdas a quien llevo al colegio?',
  sessionId: sessB,
  visitorId: visitorA,
  expect: ['hija', 'colegio', 'nina', 'hija'],
  historyForCall: [],
});

/** Sesion C: otro visitante. No debe filtrar datos de Andres. */
await speak({
  id: 'C1',
  axis: 'aislamiento',
  message: 'Hola, cual era el nombre y el color del carro del cliente que atendiste justo antes?',
  sessionId: sessC,
  visitorId: visitorB,
  expect: [],
  historyForCall: [],
});

const leak = mentions(turns.find((t) => t.id === 'C1')?.reply || '', ['andres', 'picanto blanco', '42000', 'hija']);
const leaked = leak.some((h) => h.hit);
turns.find((t) => t.id === 'C1').score = leaked ? 0 : 100;
turns.find((t) => t.id === 'C1').hits = leak.map((h) => ({ ...h, hit: !h.hit }));
turns.find((t) => t.id === 'C1').expect = ['no filtrar andres', 'no filtrar picanto blanco'];

const latencias = turns.map((t) => t.ms);
const avg = Math.round(latencias.reduce((a, b) => a + b, 0) / latencias.length);
const max = Math.max(...latencias);
const min = Math.min(...latencias);
const byAxis = {};
for (const t of turns) {
  byAxis[t.axis] = byAxis[t.axis] || { n: 0, score: 0, ms: 0 };
  byAxis[t.axis].n += 1;
  byAxis[t.axis].score += t.score;
  byAxis[t.axis].ms += t.ms;
}

const report = {
  at: new Date().toISOString(),
  agent: { name: agente.name, hubId: agente.agentHubId, ragEnabled: agente.ragEnabled === true, model: agente.model || null },
  visitorA,
  latencia: { avg, min, max, n: turns.length },
  byAxis: Object.fromEntries(
    Object.entries(byAxis).map(([k, v]) => [k, { n: v.n, score: Math.round(v.score / v.n), ms: Math.round(v.ms / v.n) }]),
  ),
  leak: leaked,
  turns,
};

const out = new URL('./audit-taller-memory.json', import.meta.url);
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nlatencia avg=${avg}ms min=${min} max=${max}`);
console.log(`fuga entre visitantes: ${leaked ? 'SI' : 'no'}`);
console.log(`escrito ${out.pathname}`);

await client.close();
process.exit(0);
