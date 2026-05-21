#!/usr/bin/env node
/**
 * Pruebas E2E multiagente en localhost.
 * node --env-file=.env scripts/test-multi-agent-local.mjs
 */
import { createConnection, Types } from 'mongoose';

const BASE = (process.env.BASE_URL || 'http://localhost:3201').replace(/\/$/, '');
const uri = process.env.MONGODB_URI || '';

const CASES = [
  {
    name: 'triaje — reembolso → handoff',
    message: 'Necesito un reembolso de mi suscripción, me cobraron dos veces',
    expectHandoff: true,
  },
  {
    name: 'triaje — saludo → orquestador',
    message: 'hola, buenas tardes',
    expectHandoff: false,
  },
];

function stripHandoffPrefix(text) {
  return String(text || '').replace(/^\[[^\]\n]+ → [^\]\n]+\]\s*/, '');
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { res, json, text };
}

async function testChat(widget, agentId, testCase, mode) {
  const body = {
    agentId,
    widgetId: String(widget._id),
    message: testCase.message,
    sessionId: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    token: widget.afhubToken,
  };
  const headers = {
    'Content-Type': 'application/json',
    'X-Widget-Token': widget.afhubToken,
  };

  const { res, json } = await fetchJson(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  const reply = json.reply || json.response || json.text || '';
  const meta = json.multiAgent || null;
  const ok = res.ok && !json.error && reply.length > 0;

  return {
    mode,
    case: testCase.name,
    http: res.status,
    ok,
    replyLen: reply.length,
    replyPreview: stripHandoffPrefix(reply).slice(0, 120),
    multiAgent: meta,
    handoff: meta?.handoff === true,
    routedName: meta?.routedAgentName || null,
    triageMethod: meta?.triageMethod || null,
    error: json.error || json.code || null,
  };
}

async function testStream(widget, agentId, message) {
  const body = {
    agentId,
    widgetId: String(widget._id),
    message,
    sessionId: `sse-${Date.now()}`,
    token: widget.afhubToken,
  };
  const res = await fetch(`${BASE}/api/widget/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': widget.afhubToken,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  const text = await res.text();
  const events = [];
  for (const block of text.split('\n\n')) {
    const line = block.trim();
    if (!line.startsWith('data:')) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()));
    } catch {
      /* ignore */
    }
  }

  const statuses = events.filter((e) => e.type === 'status');
  const done = events.find((e) => e.type === 'done');
  const err = events.find((e) => e.type === 'error');

  return {
    http: res.status,
    ok: res.ok && !!done && !err,
    statusEvents: statuses.map((s) => s.message),
    multiAgent: done?.multiAgent || null,
    replyLen: (done?.reply || '').length,
    error: err?.message || null,
  };
}

async function main() {
  console.log('=== Multi-agent E2E localhost ===');
  console.log('BASE:', BASE);

  // Health
  for (const [label, url] of [
    ['landing', `${BASE}/api/status`],
    ['AIBackHub', 'http://127.0.0.1:9003/health'],
    ['AgentFlowhub', 'http://127.0.0.1:9010'],
  ]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      console.log(`health ${label}:`, r.status, r.ok ? 'OK' : 'FAIL');
    } catch (e) {
      console.log(`health ${label}: FAIL`, e.message);
    }
  }

  if (!uri) {
    console.error('MONGODB_URI required (--env-file=.env)');
    process.exit(1);
  }

  const conn = await createConnection(uri).asPromise();

  const multiWidgets = await conn
    .collection('widgets')
    .find({ multiAgentEnabled: true })
    .project({ name: 1, agentId: 1, afhubToken: 1, multiAgentMode: 1, userId: 1 })
    .limit(5)
    .toArray();

  console.log('\nWidgets multiAgentEnabled:', multiWidgets.length);
  if (!multiWidgets.length) {
    console.log('⚠ No hay widgets con multiAgentEnabled=true en Mongo.');
    console.log('  Activa uno en Widget Builder (Business) y vuelve a ejecutar.');
  }

  const widget =
    multiWidgets.find((w) => typeof w.afhubToken === 'string' && w.afhubToken.startsWith('wt_')) ||
    multiWidgets[0];

  if (widget) {
    const owner = await conn
      .collection('subscriptions')
      .findOne({ userId: String(widget.userId) }, { projection: { plan: 1, status: 1 } });
    console.log('\nWidget:', widget.name, '| mode:', widget.multiAgentMode || 'triage');
    console.log('Owner plan:', owner?.plan ?? '?', '| status:', owner?.status ?? '?');
    console.log('Orchestrator agentId:', widget.agentId);

    const agentId = String(widget.agentId);
    const results = [];

    for (const tc of CASES) {
      results.push(await testChat(widget, agentId, tc, widget.multiAgentMode || 'triage'));
    }

    console.log('\n--- POST /api/widget/chat ---');
    for (const r of results) {
      const handoffOk =
        r.case.includes('reembolso') ? r.handoff === true : r.handoff !== true || r.triageMethod === 'default';
      const pass = r.ok && handoffOk;
      console.log(pass ? '✓' : '✗', r.case);
      console.log('  HTTP', r.http, '| handoff:', r.handoff, '| method:', r.triageMethod, '| specialist:', r.routedName);
      console.log('  preview:', r.replyPreview);
      if (r.multiAgent) console.log('  meta:', JSON.stringify(r.multiAgent));
      if (r.error) console.log('  error:', r.error);
    }

    const streamResult = await testStream(
      widget,
      agentId,
      'Necesito ayuda con facturación y reembolso',
    );
    console.log('\n--- POST /api/widget/chat/stream ---');
    console.log(streamResult.ok ? '✓' : '✗', 'SSE stream');
    console.log('  HTTP', streamResult.http, '| status events:', streamResult.statusEvents.join(' → ') || '(none)');
    console.log('  replyLen:', streamResult.replyLen, '| handoff:', streamResult.multiAgent?.handoff);
    if (streamResult.error) console.log('  error:', streamResult.error);

    // Parallel mode extra test if widget is parallel
    if (widget.multiAgentMode === 'parallel') {
      const par = await testChat(
        widget,
        agentId,
        { name: 'paralelo — billing', message: 'Quiero cancelar y que me devuelvan el pago', expectHandoff: true },
        'parallel',
      );
      console.log('\n--- Modo parallel ---');
      console.log(par.ok ? '✓' : '✗', 'parallel flow');
      console.log('  synthesized:', par.multiAgent?.synthesized, '| contributors:', par.multiAgent?.contributors?.length ?? 0);
    }
  }

  // Fallback: any widget with wt token
  if (!widget) {
    const anyW = await conn.collection('widgets').findOne(
      { afhubToken: /^wt_/ },
      { projection: { name: 1, agentId: 1, afhubToken: 1 } },
    );
    if (anyW) {
      console.log('\n(Sin multiagente) smoke chat widget:', anyW.name);
      const r = await testChat(
        anyW,
        String(anyW.agentId),
        { name: 'smoke', message: 'hola', expectHandoff: false },
        'none',
      );
      console.log(r.ok ? '✓' : '✗', 'chat básico HTTP', r.http, r.replyPreview);
    }
  }

  await conn.close();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
