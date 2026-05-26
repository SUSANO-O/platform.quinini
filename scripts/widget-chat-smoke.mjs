#!/usr/bin/env node
/**
 * Smoke rápido del widget: JSON + SSE contra la landing (local o prod).
 * Obtiene el token wt_* desde Mongo si MONGODB_URI está configurado.
 *
 *   node --env-file=.env scripts/widget-chat-smoke.mjs
 *   BASE_URL=https://botiva.space node --env-file=.env scripts/widget-chat-smoke.mjs
 *   BASE_URL=http://127.0.0.1:3201 STREAM=0 node --env-file=.env scripts/widget-chat-smoke.mjs
 *
 * Variables:
 *   BASE_URL — landing (default http://localhost:3201)
 *   WIDGET_ID, AGENT_ID — defaults: MatIAs Auto Sales Hub
 *   WIDGET_TOKEN — opcional; si falta, se lee afhubToken de Mongo
 *   MONGODB_URI — base agentflowhub_landing
 *   MESSAGE — mensaje de prueba
 *   STREAM — 1 (default) prueba también /api/widget/chat/stream; 0 solo JSON
 */
import { createConnection, Types } from 'mongoose';
import {
  loadWidgetTestEnv,
  getBaseUrl,
  DEFAULT_WIDGET_ID,
  DEFAULT_AGENT_ID,
} from './lib/load-env.mjs';

loadWidgetTestEnv();

const BASE = getBaseUrl();
const WIDGET_ID = process.env.WIDGET_ID || DEFAULT_WIDGET_ID;
const AGENT_ID = process.env.AGENT_ID || DEFAULT_AGENT_ID;
const MESSAGE = process.env.MESSAGE || 'Hola, ¿qué vehículos recomiendas para una familia?';
const TEST_STREAM = process.env.STREAM !== '0';

let token = process.env.WIDGET_TOKEN?.trim() || '';

async function resolveToken() {
  if (token) return token;
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.error('Falta WIDGET_TOKEN o MONGODB_URI para obtener afhubToken del widget.');
    process.exit(1);
  }
  const conn = await createConnection(uri).asPromise();
  try {
    const w = await conn.db.collection('widgets').findOne({ _id: new Types.ObjectId(WIDGET_ID) });
    token = w?.afhubToken || w?.publicToken || w?.token || '';
    if (!token) throw new Error(`Widget ${WIDGET_ID} sin afhubToken en Mongo`);
    console.log(`Token: ${token.slice(0, 12)}…`);
    return token;
  } finally {
    await conn.close();
  }
}

function chatBody(sessionId) {
  return {
    agentId: AGENT_ID,
    message: MESSAGE,
    token,
    widgetId: WIDGET_ID,
    sessionId,
  };
}

async function testJson() {
  console.log('\n=== POST /api/widget/chat (JSON) ===');
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatBody(`smoke_json_${Date.now()}`)),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => ({}));
  console.log('Status:', res.status);
  console.log('Code:', json.code || '—');
  if (json.details) console.log('Details:', String(json.details).slice(0, 200));
  const reply = typeof json.reply === 'string' ? json.reply : '';
  if (reply) console.log('Reply:', reply.slice(0, 280));
  const ok = res.ok && reply.length > 20 && !json.error;
  console.log(ok ? '✅ JSON OK' : '❌ JSON FAIL');
  return ok;
}

async function testStream() {
  console.log('\n=== POST /api/widget/chat/stream (SSE) ===');
  const res = await fetch(`${BASE}/api/widget/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatBody(`smoke_stream_${Date.now()}`)),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  console.log('Status:', res.status);

  let doneReply = '';
  let errorMsg = '';
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const evt = JSON.parse(line.slice(6));
      if (evt.type === 'done' && typeof evt.reply === 'string') doneReply = evt.reply;
      if (evt.type === 'error' && typeof evt.message === 'string') errorMsg = evt.message;
    } catch { /* ignore */ }
  }

  if (errorMsg) console.log('Error SSE:', errorMsg.slice(0, 200));
  if (doneReply) console.log('Reply:', doneReply.slice(0, 280));
  const ok = res.ok && doneReply.length > 10 && !errorMsg;
  console.log(ok ? '✅ STREAM OK' : '❌ STREAM FAIL');
  return ok;
}

console.log('Widget chat smoke');
console.log('  BASE_URL:', BASE);
console.log('  WIDGET_ID:', WIDGET_ID);
console.log('  AGENT_ID:', AGENT_ID);

await resolveToken();

const jsonOk = await testJson();
const streamOk = TEST_STREAM ? await testStream() : true;

if (jsonOk && streamOk) {
  console.log('\n✅ Smoke completado.');
  process.exit(0);
}
console.log('\n❌ Smoke falló.');
process.exit(1);
