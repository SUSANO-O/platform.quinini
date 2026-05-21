#!/usr/bin/env node
/** Valida pipeline contenido→creativo (requiere 2 orquestadores + modo pipeline). */
import { createConnection } from 'mongoose';
import { bustWidgetTokenCache } from './lib/bust-widget-cache.mjs';

const uri = process.env.MONGODB_URI || '';
const BASE = 'http://127.0.0.1:3201';
const AUTOEXPERT_ORCH = '69d5084c78e0af3d5536fe95';
const MESSAGE =
  'Hazme un banner 1200×628 con la informacion de los autos familiares';

async function chat(widget, message) {
  const body = {
    agentId: String(widget.agentId),
    widgetId: String(widget._id),
    message,
    sessionId: `pipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    token: widget.afhubToken,
  };
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Widget-Token': widget.afhubToken },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  return { status: res.status, json: await res.json() };
}

async function main() {
  const conn = await createConnection(uri).asPromise();
  const widget = await conn.collection('widgets').findOne({
    name: 'Mi Widget',
    agentId: AUTOEXPERT_ORCH,
    multiAgentEnabled: true,
    multiAgentMode: 'pipeline',
    'orchestratorAgentIds.0': { $exists: true },
  });
  if (!widget) {
    console.log('⚠ Ejecuta: node --env-file=.env scripts/setup-multi-orchestrator-test.mjs');
    await conn.close();
    process.exit(1);
  }

  console.log('Widget:', widget.name, '| mode: pipeline');
  console.log('Orquestadores:', widget.agentId, '+', (widget.orchestratorAgentIds || []).join(', '));
  console.log('Mensaje:', MESSAGE);

  await bustWidgetTokenCache(String(widget.afhubToken), String(widget._id));

  const r = await chat(widget, MESSAGE);
  console.log('\nHTTP', r.status);
  console.log('multiAgent:', JSON.stringify(r.json.multiAgent, null, 2));
  console.log('images:', Array.isArray(r.json.images) ? r.json.images.length : 0);
  console.log('reply preview:', (r.json.reply || r.json.error || '').slice(0, 200));

  const pass =
    r.status === 200 &&
    r.json.multiAgent?.mode === 'pipeline' &&
    r.json.multiAgent?.pipeline === true &&
    r.json.multiAgent?.pipelineSteps?.length === 2;
  console.log(pass ? '\n✓ Pipeline OK' : '\n✗ Pipeline FAIL');
  await conn.close();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
