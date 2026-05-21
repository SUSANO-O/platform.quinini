#!/usr/bin/env node
import { createConnection, Types } from 'mongoose';

const uri = process.env.MONGODB_URI || '';
const conn = await createConnection(uri).asPromise();
const w = await conn.collection('widgets').findOne({ name: 'agente smith' });
if (!w) {
  console.log('widget not found');
  process.exit(0);
}
const orch = await conn.collection('clientagents').findOne({
  _id: new Types.ObjectId(String(w.agentId)),
});
const subIds = (orch?.subAgentIds ?? [])
  .map((id) => String(id))
  .filter((id) => /^[a-f0-9]{24}$/i.test(id));
const subs = subIds.length
  ? await conn
      .collection('clientagents')
      .find({ _id: { $in: subIds.map((id) => new Types.ObjectId(id)) } })
      .toArray()
  : [];
console.log('widget', w.name, '| multi', w.multiAgentEnabled, '| userId', w.userId);
console.log('orch', orch?.name, '| hub', orch?.agentHubId, '| sync', orch?.syncStatus);
for (const s of subs) console.log(' sub', s.name, '| hub', s.agentHubId, '| sync', s.syncStatus);

const BASE = 'http://127.0.0.1:3201';
const body = {
  agentId: String(w.agentId),
  widgetId: String(w._id),
  message: 'Necesito un reembolso de mi suscripción',
  sessionId: `dbg-${Date.now()}`,
  token: w.afhubToken,
};
const res = await fetch(`${BASE}/api/widget/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Widget-Token': w.afhubToken },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(120_000),
});
const json = await res.json();
console.log('\nchat HTTP', res.status);
console.log('multiAgent', JSON.stringify(json.multiAgent));
console.log('error', json.error, json.code);
console.log('reply', (json.reply || '').slice(0, 150));
await conn.close();
