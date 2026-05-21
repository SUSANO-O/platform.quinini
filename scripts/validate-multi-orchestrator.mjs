#!/usr/bin/env node
/** Valida multi-orquestador en Mi Widget (orchestratorAgentIds). */
import { createConnection } from 'mongoose';

const uri = process.env.MONGODB_URI || '';
const BASE = 'http://127.0.0.1:3201';

async function chat(widget, message) {
  const body = {
    agentId: String(widget.agentId),
    widgetId: String(widget._id),
    message,
    sessionId: `mo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    token: widget.afhubToken,
  };
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Widget-Token': widget.afhubToken },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  return { status: res.status, json: await res.json() };
}

async function main() {
  const conn = await createConnection(uri).asPromise();
  const widget = await conn.collection('widgets').findOne({
    name: 'Mi Widget',
    agentId: '69d5084c78e0af3d5536fe95',
    multiAgentEnabled: true,
    orchestratorAgentIds: { $exists: true, $not: { $size: 0 } },
  });
  if (!widget) {
    console.log('⚠ Ejecuta setup-multi-orchestrator-test.mjs primero');
    process.exit(1);
  }
  console.log('Widget:', widget.name);
  console.log('Orquestadores:', widget.agentId, '+', (widget.orchestratorAgentIds || []).join(', '));

  await new Promise((r) => setTimeout(r, 2000));

  const r1 = await chat(widget, 'Necesito un reembolso de mi suscripción, me cobraron dos veces');
  console.log('\nreembolso:', r1.status, '| handoff:', r1.json.multiAgent?.handoff, '| specialist:', r1.json.multiAgent?.routedAgentName);
  console.log('meta:', JSON.stringify(r1.json.multiAgent));

  await new Promise((r) => setTimeout(r, 4000));

  const r2 = await chat(widget, 'hola, buenas tardes');
  console.log('\nsaludo:', r2.status, '| handoff:', r2.json.multiAgent?.handoff);

  const pass =
    r1.status === 200 &&
    r1.json.multiAgent?.enabled === true &&
    r1.json.multiAgent?.handoff === true &&
    r2.json.multiAgent?.enabled === true;
  console.log(pass ? '\n✓ Multi-orquestador OK' : '\n✗ Multi-orquestador FAIL');
  await conn.close();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
