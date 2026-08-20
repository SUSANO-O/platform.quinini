#!/usr/bin/env node
/**
 * Fase 1 UX stream: eventos status antes del primer token.
 * Uso: npx tsx --env-file=.env scripts/widget-stream-status-phase1-test.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';

const BASE = (process.env.LANDING_URL || 'http://127.0.0.1:3201').replace(/\/$/, '');

async function loadAgentAndToken() {
  if (process.env.WIDGET_TOKEN && process.env.AGENT_ID) {
    return { token: process.env.WIDGET_TOKEN.trim(), agentId: process.env.AGENT_ID.trim() };
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const landing = client.db('agentflowhub_landing');
  const widgets = await landing
    .collection('widgets')
    .find({ active: { $ne: false } }, { projection: { agentId: 1, afhubToken: 1 } })
    .toArray();
  for (const w of widgets) {
    if (!w.afhubToken?.startsWith('wt_') || !ObjectId.isValid(w.agentId)) continue;
    const c = await landing.collection('clientagents').findOne(
      { _id: new ObjectId(w.agentId) },
      { projection: { name: 1 } },
    );
    if (!c || !/taller/i.test(String(c.name))) continue;
    await client.close();
    return { token: w.afhubToken, agentId: String(w.agentId) };
  }
  await client.close();
  throw new Error('No se encontró agente de taller con widget wt_');
}

async function readSSE(res, maxMs = 120_000) {
  const statuses = [];
  const tokens = [];
  let done = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const waitMs = Math.min(5000, deadline - Date.now());
    const chunk = await Promise.race([
      reader.read(),
      new Promise((resolve) => setTimeout(() => resolve({ value: undefined, done: false, timedOut: true }), waitMs)),
    ]);
    if (chunk.timedOut) continue;
    const { value, done: streamDone } = chunk;
    if (streamDone) break;
    if (!value) continue;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const block of parts) {
      const line = block.trim();
      if (!line.startsWith('data:')) continue;
      let evt;
      try {
        evt = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === 'status') statuses.push(evt);
      if (evt.type === 'token') tokens.push(evt.text || '');
      if (evt.type === 'done') done = evt;
      if (evt.type === 'error') throw new Error(evt.message || evt.code || 'stream error');
    }
    if (done) break;
  }
  try {
    reader.cancel();
  } catch {
    /* noop */
  }
  return { statuses, tokens, done };
}

async function chatStream(agentId, token, message, sessionId) {
  const res = await fetch(`${BASE}/api/widget/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': token,
    },
    body: JSON.stringify({
      agentId,
      message,
      sessionId,
      visitorId: `vis_phase1_${Date.now()}`,
      token,
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return readSSE(res);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Contrato Fase 0: prepare primero; sin rag/model/hub de adorno como 2º status. */
function assertHonestBoot(statuses, label) {
  assert(statuses.length >= 1, `${label}: al menos un status`);
  assert(statuses[0].phase === 'prepare', `${label}: primer status debe ser prepare (fue ${statuses[0].phase})`);
  if (statuses.length >= 2) {
    const second = statuses[1].phase;
    const anticipatory = new Set(['rag', 'model', 'hub', 'vision', 'skills', 'mcp', 'tools']);
    if (anticipatory.has(second)) {
      throw new Error(`${label}: status anticipatorio tras prepare: ${second}`);
    }
  }
}

const { token, agentId } = await loadAgentAndToken();
const sid = `sess_phase0_${Date.now()}`;

console.log('Fase 0 — status SSE honestos (boot prepare)\n');

const hola = await chatStream(agentId, token, 'Hola, buenas tardes.', sid);
assertHonestBoot(hola.statuses, 'saludo');
assert(hola.tokens.length >= 1 || hola.done?.reply, 'saludo: respuesta recibida');
console.log(`✓ saludo: phases=${hola.statuses.map((s) => s.phase).join('→')} tokens=${hola.tokens.length}`);

const inv = await chatStream(
  agentId,
  token,
  'Que Kia Picanto 2026 tienen en el inventario premium de MatIAs Auto Sales en Bogota?',
  `${sid}_a3`,
);
assertHonestBoot(inv.statuses, 'inventario');
assert(inv.tokens.length >= 1 || inv.done?.reply, 'inventario: respuesta recibida');
console.log(`✓ inventario: phases=${inv.statuses.map((s) => s.phase).join('→')}`);

const ret = await chatStream(
  agentId,
  token,
  'Si el Picanto nuevo del inventario vale lo que ustedes manejan, cuanto me faltaria para el cambio? Razona en voz alta.',
  `${sid}_a6`,
);
assertHonestBoot(ret.statuses, 'retoma');
assert(ret.tokens.length >= 1 || ret.done?.reply, 'retoma: respuesta recibida');
console.log(`✓ retoma: phases=${ret.statuses.map((s) => s.phase).join('→')}`);

console.log('\nFase 0 stream status honesty: PASS');
