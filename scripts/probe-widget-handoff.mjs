#!/usr/bin/env node
/**
 * POST /api/widget/chat una vez (token desde Mongo del widget).
 * node --env-file=.env scripts/probe-widget-handoff.mjs
 */
import { createConnection, Types } from 'mongoose';

const uri = process.env.MONGODB_URI || '';
const BASE = (process.env.BASE_URL || 'https://www.quinini.online').replace(/\/$/, '');
const WIDGET_ID = process.env.WIDGET_ID || '6a03a54c4f69fa7fa9027170';
const AGENT_ID = process.env.AGENT_ID || '69d5084c78e0af3d5536fe95';

if (!uri) {
  console.error('MONGODB_URI required');
  process.exit(1);
}

const conn = await createConnection(uri).asPromise();
const w = await conn.collection('widgets').findOne(
  { _id: new Types.ObjectId(WIDGET_ID) },
  { projection: { afhubToken: 1 } },
);
const token = typeof w?.afhubToken === 'string' ? w.afhubToken : '';
await conn.close();

if (!token) {
  console.error('Widget sin afhubToken');
  process.exit(1);
}

const message =
  process.env.PROBE_MESSAGE ||
  'Soy Harold Vargas, celular 3001234567, correo harold@test.com. Ya diste mis datos: pasame al Closer Financiero para confirmar póliza de vida deudores y tasa EA con score 780 Datacrédito.';

const body = {
  agentId: AGENT_ID,
  message,
  sessionId: `probe-${Date.now()}`,
  token,
};

const res = await fetch(`${BASE}/api/widget/chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Widget-Token': token,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let j;
try {
  j = JSON.parse(text);
} catch {
  j = { raw: text.slice(0, 500) };
}

console.log('HTTP', res.status);
console.log('reply (primeros 1200 chars):\n');
const reply = typeof j.reply === 'string' ? j.reply : JSON.stringify(j, null, 2);
console.log(reply.slice(0, 1200));
if (reply.length > 1200) console.log('\n… [truncado]');
console.log('\n--- señales ---');
console.log('[FIN-ANALYSIS] al inicio:', /^[\s]*\[FIN-ANALYSIS\]/i.test(reply));
console.log('Incluye "Validando perfil"', /validando perfil/i.test(reply));
console.log('toolsUsed:', j.toolsUsed);
