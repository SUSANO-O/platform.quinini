#!/usr/bin/env node
/** Valida auto-handoff: desactiva toggle del Mi Widget con AutoExpert, prueba, restaura. */
import { createConnection } from 'mongoose';

const uri = process.env.MONGODB_URI || '';
const BASE = 'http://127.0.0.1:3201';
const AUTOEXPERT_ORCH = '69d5084c78e0af3d5536fe95';

async function chat(widget, message) {
  const body = {
    agentId: String(widget.agentId),
    widgetId: String(widget._id),
    message,
    sessionId: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    agentId: AUTOEXPERT_ORCH,
    afhubToken: /^wt_/,
  });
  if (!widget) throw new Error('Mi Widget (AutoExpert) not found');

  const prev = {
    multiAgentEnabled: widget.multiAgentEnabled === true,
    orchestratorAgentIds: widget.orchestratorAgentIds || [],
    agentIds: widget.agentIds || [],
    multiAgentMode: widget.multiAgentMode || 'triage',
  };

  await conn.collection('widgets').updateOne(
    { _id: widget._id },
    { $set: { multiAgentEnabled: false, orchestratorAgentIds: [], agentIds: [] } },
  );
  console.log('Toggle OFF en Mi Widget', String(widget._id));

  await new Promise((r) => setTimeout(r, 5000));

  const r1 = await chat(widget, 'Necesito un reembolso de mi suscripción, me cobraron dos veces');
  console.log('\nreembolso:', r1.status, '| handoff:', r1.json.multiAgent?.handoff, '| specialist:', r1.json.multiAgent?.routedAgentName);
  console.log('meta:', JSON.stringify(r1.json.multiAgent));

  await new Promise((r) => setTimeout(r, 5000));

  const r2 = await chat(widget, 'hola, buenas tardes');
  console.log('\nsaludo:', r2.status, '| handoff:', r2.json.multiAgent?.handoff, '| specialist:', r2.json.multiAgent?.routedAgentName);
  console.log('meta:', JSON.stringify(r2.json.multiAgent));

  await conn.collection('widgets').updateOne({ _id: widget._id }, { $set: prev });
  console.log('\nRestaurado multiAgentEnabled=', prev.multiAgentEnabled);

  const pass =
    r1.json.multiAgent?.enabled === true &&
    r1.json.multiAgent?.handoff === true &&
    r2.json.multiAgent?.enabled === true &&
    r2.json.multiAgent?.handoff !== true;
  console.log(pass ? '\n✓ Auto-handoff OK' : '\n✗ Auto-handoff FAIL');
  await conn.close();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
