#!/usr/bin/env node
import { createConnection, Types } from 'mongoose';
import { randomBytes } from 'crypto';

const uri = process.env.MONGODB_URI || '';
const conn = await createConnection(uri).asPromise();
const mi = await conn.collection('widgets').findOne({ name: 'Mi Widget' });
const orchId = String(mi.agentId);
let w = await conn.collection('widgets').findOne({
  agentId: orchId,
  multiAgentEnabled: { $ne: true },
  afhubToken: /^wt_/,
});
if (!w) {
  const ins = await conn.collection('widgets').insertOne({
    name: 'E2E auto-handoff temp',
    userId: mi.userId,
    agentId: orchId,
    afhubToken: `wt_${randomBytes(24).toString('hex')}`,
    multiAgentEnabled: false,
    multiAgentMode: 'triage',
    agentIds: [],
    orchestratorAgentIds: [],
    color: mi.color || '#0d9488',
    title: 'E2E auto',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  w = await conn.collection('widgets').findOne({ _id: ins.insertedId });
  console.log('Created temp widget', w.name, w._id);
} else {
  console.log('Using widget', w.name, w._id);
}

const BASE = 'http://127.0.0.1:3201';
for (const [label, message] of [
  ['reembolso', 'Necesito un reembolso de mi suscripción, me cobraron dos veces'],
  ['saludo', 'hola, buenas tardes'],
]) {
  const body = {
    agentId: orchId,
    widgetId: String(w._id),
    message,
    sessionId: `auto-${label}-${Date.now()}`,
    token: w.afhubToken,
  };
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Widget-Token': w.afhubToken },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json();
  console.log(`\n${label} HTTP`, res.status, '| handoff', json.multiAgent?.handoff, '| specialist', json.multiAgent?.routedAgentName);
  console.log('method', json.multiAgent?.triageMethod, '| enabled', json.multiAgent?.enabled);
  console.log('preview', (json.reply || json.error || '').slice(0, 100));
  await new Promise((r) => setTimeout(r, 4000));
}
await conn.close();
