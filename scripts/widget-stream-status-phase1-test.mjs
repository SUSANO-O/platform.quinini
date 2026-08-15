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

const { token, agentId } = await loadAgentAndToken();
const sid = `sess_phase1_${Date.now()}`;

console.log('Fase 1 — status SSE antes de tokens\n');

const hola = await chatStream(agentId, token, 'Hola, buenas tardes.', sid);
assert(hola.statuses.length >= 1, 'saludo: al menos un evento status');
console.log(`✓ saludo: ${hola.statuses.length} status, ${hola.tokens.length} tokens`);

const inv = await chatStream(
  agentId,
  token,
  'Que Kia Picanto 2026 tienen en el inventario premium de MatIAs Auto Sales en Bogota?',
  `${sid}_a3`,
);
assert(inv.statuses.length >= 1, 'inventario: al menos un status');
const invMsg = inv.statuses.map((s) => s.message).join(' ');
const invPhases = inv.statuses.map((s) => s.phase).join(' ');
assert(
  /inventario|precio|documento/i.test(invMsg) || invPhases.includes('rag'),
  `inventario: mensaje o fase rag (${invMsg})`,
);
assert(inv.tokens.length >= 1 || inv.done?.reply, 'inventario: respuesta recibida');
console.log(`✓ A3 inventario: ${inv.statuses[0]?.message}`);

const ret = await chatStream(
  agentId,
  token,
  'Si el Picanto nuevo del inventario vale lo que ustedes manejan, cuanto me faltaria para el cambio? Razona en voz alta.',
  `${sid}_a6`,
);
assert(ret.statuses.length >= 1, 'retoma: al menos un status');
const retMsg = ret.statuses.map((s) => s.message).join(' ');
assert(/retoma|inventario|precio|catálogo|Calculando|Razonando|Evaluando/i.test(retMsg), `retoma: mensaje contextual (${retMsg})`);
console.log(`✓ A6 retoma: ${ret.statuses[0]?.message}`);

console.log('\nFase 1 stream status: PASS');
