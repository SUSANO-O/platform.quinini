#!/usr/bin/env node
/**
 * Verifica persistencia de mensajes + API /api/conversations con curl-like fetch.
 * node --env-file=.env scripts/_verify-chats-curl.mjs
 */
import crypto from 'crypto';
import { createConnection, Types } from 'mongoose';

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const WIDGET_ID = process.env.WIDGET_ID || '6a1db068e3af6ba0abf1f82f';
const AGENT_ID = process.env.AGENT_ID || '6a1da96d094e6d2eefa7d066';
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI required');
  process.exit(1);
}

function createSessionToken(userId) {
  const payload = `${userId}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

const conn = await createConnection(process.env.MONGODB_URI).asPromise();
const w = await conn.collection('widgets').findOne(
  { _id: new Types.ObjectId(WIDGET_ID) },
  { projection: { afhubToken: 1, userId: 1, name: 1 } },
);
if (!w) {
  console.error('Widget no encontrado:', WIDGET_ID);
  process.exit(1);
}

const token = typeof w.afhubToken === 'string' ? w.afhubToken : '';
const userId = String(w.userId || '');
const sessionId = `sess_verify_${Date.now()}_curltest`;
const message = process.env.PROBE_MESSAGE || 'hola, prueba curl dashboard chats';

console.log('--- 0) POST /api/widget/events (widget_opened) ---');
const openRes = await fetch(`${BASE}/api/widget/events`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Widget-Token': token },
  body: JSON.stringify({
    event: 'widget_opened',
    agentId: AGENT_ID,
    sessionId,
    token,
  }),
});
console.log('HTTP', openRes.status, (await openRes.text()).slice(0, 120));

console.log('--- 1) POST /api/widget/chat ---');
console.log('base:', BASE);
console.log('widget:', w.name, WIDGET_ID);
console.log('sessionId:', sessionId);

const chatRes = await fetch(`${BASE}/api/widget/chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Widget-Token': token,
  },
  body: JSON.stringify({
    agentId: AGENT_ID,
    widgetId: WIDGET_ID,
    message,
    sessionId,
    token,
  }),
});

const chatText = await chatRes.text();
let chatJson;
try {
  chatJson = JSON.parse(chatText);
} catch {
  chatJson = { raw: chatText.slice(0, 400) };
}

console.log('HTTP', chatRes.status);
console.log('reply preview:', String(chatJson.reply || chatJson.error || chatText).slice(0, 200));
console.log('multiAgent mode:', chatJson.multiAgent?.mode || chatJson.multiAgent?.triageMethod || 'n/a');

const evtRes = await fetch(`${BASE}/api/widget/events`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Widget-Token': token },
  body: JSON.stringify({
    event: 'message_received',
    agentId: AGENT_ID,
    sessionId,
    token,
    details: { length: message.length },
  }),
});
console.log('message_received HTTP', evtRes.status);

// Esperar persistencia async
await new Promise((r) => setTimeout(r, 1500));

const msgs = await conn.collection('widgetmessages')
  .find({ sessionId, userId })
  .sort({ createdAt: 1 })
  .toArray();

console.log('\n--- 2) Mongo WidgetMessage ---');
console.log('count:', msgs.length);
for (const m of msgs) {
  console.log(`- ${m.role}: ${String(m.content || '').slice(0, 80)}`);
}

const sessionCookie = createSessionToken(userId);
const cookieHeader = `afhub_session=${sessionCookie}`;

console.log('\n--- 3) GET /api/conversations?status=active ---');
const listRes = await fetch(`${BASE}/api/conversations?status=active&limit=20`, {
  headers: { Cookie: cookieHeader },
});
const listJson = await listRes.json();
console.log('HTTP', listRes.status);
const hit = Array.isArray(listJson.items)
  ? listJson.items.find((i) => i.sessionId === sessionId || String(i.sessionId || '').includes('curltest'))
  : null;
console.log('session in list:', hit ? { sessionId: hit.sessionId, messageCount: hit.messageCount, lastMessage: (hit.lastMessage || '').slice(0, 60) } : 'NOT FOUND');

console.log('\n--- 4) GET /api/conversations/[sessionId] ---');
const transcriptRes = await fetch(`${BASE}/api/conversations/${encodeURIComponent(sessionId)}`, {
  headers: { Cookie: cookieHeader },
});
const transcriptJson = await transcriptRes.json();
console.log('HTTP', transcriptRes.status);
const tmsgs = Array.isArray(transcriptJson.messages) ? transcriptJson.messages : [];
console.log('messages in API:', tmsgs.length);
for (const m of tmsgs) {
  console.log(`- ${m.role}: ${String(m.content || '').slice(0, 80)}`);
}

await conn.close();

const ok = chatRes.ok && openRes.ok && msgs.length >= 2 && transcriptRes.status === 200 && tmsgs.length >= 2;
console.log('\n--- RESULT ---');
console.log(ok ? 'OK: mensajes persistidos y visibles en API' : 'FAIL: revisar logs arriba');
process.exit(ok ? 0 : 1);
