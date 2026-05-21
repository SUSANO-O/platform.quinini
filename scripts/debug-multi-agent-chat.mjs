#!/usr/bin/env node
import { createConnection, Types } from 'mongoose';

const BASE = 'http://localhost:3201';
const WIDGET_ID = '6a0b4dd9850f3a9ce3b5cb40';

const conn = await createConnection(process.env.MONGODB_URI).asPromise();
const w = await conn.collection('widgets').findOne({ _id: new Types.ObjectId(WIDGET_ID) });
await conn.close();

if (!w) { console.error('widget not found'); process.exit(1); }

const agentId = String(w.agentId);
const token = String(w.afhubToken);
console.log('widget', w.name, 'multiAgent', w.multiAgentEnabled, 'mode', w.multiAgentMode);
console.log('agentId', agentId, 'token', token.slice(0, 16) + '…');

const payload = {
  agentId,
  widgetId: WIDGET_ID,
  message: 'Necesito un reembolso de mi suscripcion',
  sessionId: 'debug-' + Date.now(),
  token,
};

const res = await fetch(`${BASE}/api/widget/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Widget-Token': token },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(120_000),
});

const text = await res.text();
console.log('\nHTTP', res.status);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text.slice(0, 800));
}
