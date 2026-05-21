#!/usr/bin/env node
/**
 * Stress tests for agent-flow-landing.
 *
 * Modes:
 *   light       — GET /api/status + /api/widget/config (no LLM)
 *   widget      — light + widget events + rate-limit probe (AGENT_COOLDOWN on /api/widget/chat)
 *   multiagent  — concurrent widget chat (triaje/handoff); may hit AGENT_COOLDOWN if LLM saturated
 *   all         — runs light → widget → multiagent sequentially
 *
 * Usage:
 *   node --env-file=.env scripts/stress-landing.mjs
 *   STRESS_MODE=widget node --env-file=.env scripts/stress-landing.mjs
 *   node --env-file=.env scripts/stress-landing.mjs --mode multiagent --concurrency 5 --duration 20
 *
 * Env:
 *   BASE_URL              default http://localhost:3201
 *   MONGODB_URI           auto-load widget token (recommended)
 *   WIDGET_TOKEN          override wt_* token
 *   WIDGET_ID / AGENT_ID  optional overrides
 *   STRESS_MODE           light | widget | multiagent | all
 *   STRESS_DURATION_SEC   default 15 (light/widget load phase)
 *   STRESS_CONCURRENCY    default 10 (light), 8 (widget), 5 (multiagent)
 *   STRESS_LLM            1 = enable real chat in multiagent (default 1)
 *   STRESS_STRICT         1 = exit 1 if thresholds fail
 *   STRESS_ALLOW_COOLDOWN 1 = AGENT_COOLDOWN counts as soft-OK (default 1)
 */
import { createConnection, Types } from 'mongoose';

const BASE = (process.env.BASE_URL || 'http://localhost:3201').replace(/\/$/, '');
const MONGO_URI = process.env.MONGODB_URI || '';
const STRICT = process.env.STRESS_STRICT === '1';
const ALLOW_COOLDOWN = process.env.STRESS_ALLOW_COOLDOWN !== '0';
const STRESS_LLM = process.env.STRESS_LLM !== '0';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    mode: process.env.STRESS_MODE || 'light',
    duration: Number(process.env.STRESS_DURATION_SEC || 15),
    concurrency: process.env.STRESS_CONCURRENCY ? Number(process.env.STRESS_CONCURRENCY) : null,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) out.mode = args[++i];
    else if (args[i] === '--duration' && args[i + 1]) out.duration = Number(args[++i]);
    else if (args[i] === '--concurrency' && args[i + 1]) out.concurrency = Number(args[++i]);
    else if (args[i] === '--help' || args[i] === '-h') out.help = true;
  }
  return out;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function printReport(report) {
  const { name, completed, durationSec, latencies, statusHist, codes, extras } = report;
  const rps = durationSec > 0 ? (completed / durationSec).toFixed(1) : '0';
  console.log(`\n── ${name} ──`);
  console.log(`  Requests: ${completed} in ${durationSec}s (${rps} req/s)`);
  console.log(`  Latency ms — p50: ${percentile(latencies, 50).toFixed(0)} | p95: ${percentile(latencies, 95).toFixed(0)} | p99: ${percentile(latencies, 99).toFixed(0)} | max: ${Math.max(...latencies, 0).toFixed(0)}`);
  console.log('  HTTP status:', JSON.stringify(statusHist));
  if (Object.keys(codes).length) console.log('  Response codes:', JSON.stringify(codes));
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      console.log(`  ${k}:`, typeof v === 'object' ? JSON.stringify(v) : v);
    }
  }
}

async function runLoad({ name, durationSec, concurrency, task, timeoutMs = 30_000 }) {
  const end = Date.now() + durationSec * 1000;
  const latencies = [];
  const statusHist = {};
  const codes = {};
  let completed = 0;
  let hardErrors = 0;

  async function worker() {
    while (Date.now() < end) {
      const t0 = performance.now();
      try {
        const result = await task({ signal: AbortSignal.timeout(timeoutMs) });
        latencies.push(performance.now() - t0);
        statusHist[result.status] = (statusHist[result.status] || 0) + 1;
        if (result.code) codes[result.code] = (codes[result.code] || 0) + 1;
        if (result.hardError) hardErrors++;
      } catch {
        latencies.push(performance.now() - t0);
        statusHist.error = (statusHist.error || 0) + 1;
        hardErrors++;
      }
      completed++;
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsed = (Date.now() - started) / 1000;

  return {
    name,
    completed,
    durationSec: elapsed,
    latencies,
    statusHist,
    codes,
    hardErrors,
  };
}

async function loadWidgetContext() {
  let token = process.env.WIDGET_TOKEN?.trim() || '';
  let widgetId = process.env.WIDGET_ID?.trim() || '';
  let agentId = process.env.AGENT_ID?.trim() || '';

  if (!MONGO_URI) {
    return token ? { token, widgetId, agentId, multiAgentEnabled: false } : null;
  }

  const conn = await createConnection(MONGO_URI).asPromise();
  try {
    let widget = null;
    if (widgetId && Types.ObjectId.isValid(widgetId)) {
      widget = await conn.collection('widgets').findOne({ _id: new Types.ObjectId(widgetId) });
    }
    if (!widget) {
      widget =
        (await conn.collection('widgets').findOne({ multiAgentEnabled: true, afhubToken: /^wt_/ })) ||
        (await conn.collection('widgets').findOne({ afhubToken: /^wt_/ }));
    }
    if (!widget) return token ? { token, widgetId, agentId, multiAgentEnabled: false } : null;
    return {
      token: token || String(widget.afhubToken || ''),
      widgetId: widgetId || String(widget._id),
      agentId: agentId || String(widget.agentId || ''),
      multiAgentEnabled: widget.multiAgentEnabled === true,
      name: widget.name,
    };
  } finally {
    await conn.close();
  }
}

async function getStatus() {
  const res = await fetch(`${BASE}/api/status`, { signal: AbortSignal.timeout(8_000) });
  return { status: res.status, hardError: !res.ok };
}

async function getWidgetConfig(token) {
  const res = await fetch(`${BASE}/api/widget/config?token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  let code = null;
  try {
    const j = await res.json();
    code = j.code || j.error || null;
  } catch {
    /* ignore */
  }
  return { status: res.status, code, hardError: res.status >= 500 };
}

async function postWidgetEvent(token, widgetId, agentId) {
  const body = {
    event: 'widget_loaded',
    agentId,
    widgetId,
    token,
    sessionId: `stress-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
  };
  const res = await fetch(`${BASE}/api/widget/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return { status: res.status, hardError: res.status >= 500 };
}

async function postWidgetChat(ctx, message, sessionId, timeoutMs = 120_000) {
  const body = {
    agentId: ctx.agentId,
    widgetId: ctx.widgetId,
    message,
    sessionId,
    token: ctx.token,
  };
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': ctx.token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  const code = json.code || null;
  const handoff = json.multiAgent?.handoff === true;
  const softOk = ALLOW_COOLDOWN && (code === 'AGENT_COOLDOWN' || /rate.?limit/i.test(String(json.error || '')));
  const hardError =
    res.status >= 500 ||
    (code === 'WIDGET_CHAT_FAILED' || code === 'HUB_CHAT_PROXY_FAILED') ||
    (res.status === 404 && !softOk) ||
    (res.status === 403 && code !== 'QUOTA_EXCEEDED' && code !== 'ORIGIN_NOT_ALLOWED');

  return {
    status: res.status,
    code,
    handoff,
    softOk,
    hardError: hardError && !softOk,
    replyLen: (json.reply || '').length,
  };
}

async function scenarioLight(ctx, duration, concurrency) {
  console.log('\n[light] status + widget/config');
  let flip = 0;
  const report = await runLoad({
    name: 'light',
    durationSec: duration,
    concurrency,
    timeoutMs: 12_000,
    task: async () => {
      flip++;
      if (flip % 2 === 0 || !ctx?.token) return getStatus();
      return getWidgetConfig(ctx.token);
    },
  });

  const p95 = percentile(report.latencies, 95);
  const ok = (report.statusHist[200] || 0) > 0 && p95 < 15000;
  printReport(report);
  return { ok, report };
}

async function scenarioWidget(ctx, duration, concurrency) {
  if (!ctx?.token) {
    console.log('\n[widget] SKIP — no WIDGET_TOKEN / Mongo widget');
    return { ok: true, skipped: true };
  }

  console.log('\n[widget] config + events load');
  const report = await runLoad({
    name: 'widget-load',
    durationSec: duration,
    concurrency,
    timeoutMs: 12_000,
    task: async ({ signal }) => {
      const pick = Math.random();
      if (pick < 0.45) {
        const res = await fetch(`${BASE}/api/widget/config?token=${encodeURIComponent(ctx.token)}`, { signal });
        return { status: res.status, hardError: res.status >= 500 };
      }
      if (pick < 0.85) {
        return postWidgetEvent(ctx.token, ctx.widgetId, ctx.agentId);
      }
      const res = await fetch(`${BASE}/api/status`, { signal });
      return { status: res.status, hardError: !res.ok };
    },
  });

  printReport(report);

  console.log('\n[widget] rate-limit probe (50 parallel chat POSTs, expect AGENT_COOLDOWN)');
  const rlStatuses = { 200: 0, cooldown: 0, timeout: 0, other: 0 };
  const rlCodes = {};
  const probeTasks = Array.from({ length: 50 }, (_, i) => (async () => {
    try {
      const r = await postWidgetChat(ctx, 'ping stress', `rl-probe-${Date.now()}-${i}`, 8_000);
      if (r.code === 'AGENT_COOLDOWN' || r.softOk) rlStatuses.cooldown++;
      else if (r.status === 200) rlStatuses[200]++;
      else rlStatuses.other++;
      if (r.code) rlCodes[r.code] = (rlCodes[r.code] || 0) + 1;
    } catch {
      rlStatuses.timeout++;
    }
  })());
  await Promise.all(probeTasks);
  console.log('  Rate-limit probe:', JSON.stringify(rlStatuses));
  if (Object.keys(rlCodes).length) console.log('  Rate-limit probe codes:', JSON.stringify(rlCodes));

  const rlOk = rlStatuses.cooldown > 0 || rlStatuses[200] > 0;
  const loadOk = percentile(report.latencies, 95) < 15000;
  return { ok: rlOk && loadOk, report, rlStatuses };
}

async function scenarioMultiagent(ctx, duration, concurrency) {
  if (!ctx?.token || !ctx.agentId) {
    console.log('\n[multiagent] SKIP — no widget context');
    return { ok: true, skipped: true };
  }
  if (!STRESS_LLM) {
    console.log('\n[multiagent] SKIP — STRESS_LLM=0');
    return { ok: true, skipped: true };
  }

  console.log('\n[multiagent] concurrent widget chat (unique sessions)');
  const messages = [
    'hola, buenas tardes',
    'Necesito un reembolso de mi suscripción',
    'Quiero hablar con el closer financiero',
  ];
  let handoffs = 0;
  let softCooldowns = 0;
  let idx = 0;

  const report = await runLoad({
    name: 'multiagent',
    durationSec: duration,
    concurrency,
    timeoutMs: 120_000,
    task: async () => {
      const msg = messages[idx++ % messages.length];
      const sessionId = `stress-ma-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const r = await postWidgetChat(ctx, msg, sessionId);
      if (r.handoff) handoffs++;
      if (r.softOk) softCooldowns++;
      return {
        status: r.status,
        code: r.code,
        hardError: r.hardError,
      };
    },
  });

  printReport({
    ...report,
    extras: {
      handoffs,
      softCooldowns,
      multiAgentEnabled: ctx.multiAgentEnabled,
    },
  });

  const hardRate = report.completed > 0 ? report.hardErrors / report.completed : 0;
  const ok = hardRate < 0.15;
  return { ok, report, handoffs, hardRate };
}

function printHelp() {
  console.log(`
Stress test — agent-flow-landing

  node --env-file=.env scripts/stress-landing.mjs [options]

Options:
  --mode light|widget|multiagent|all   (default: light)
  --duration SEC                       load duration per scenario
  --concurrency N                      parallel workers

Env: BASE_URL, MONGODB_URI, WIDGET_TOKEN, STRESS_STRICT=1
`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  const mode = String(args.mode || 'light').toLowerCase();
  const duration = Number.isFinite(args.duration) && args.duration > 0 ? args.duration : 15;

  console.log('=== Landing stress test ===');
  console.log('BASE:', BASE);
  console.log('Mode:', mode);
  console.log('Duration:', duration, 's');

  try {
    const h = await fetch(`${BASE}/api/status`, { signal: AbortSignal.timeout(20_000) });
    console.log('Preflight /api/status:', h.status, h.ok ? 'OK' : 'FAIL');
    if (!h.ok) {
      console.error('Landing not reachable. Start with npm run dev');
      process.exit(1);
    }
  } catch (e) {
    console.error('Landing not reachable:', e.message);
    process.exit(1);
  }

  const ctx = await loadWidgetContext();
  if (ctx?.token) {
    console.log('Widget:', ctx.name || ctx.widgetId, '| multiAgent:', ctx.multiAgentEnabled ? 'yes' : 'no');
  } else {
    console.log('Widget: (none — light mode will only hit /api/status)');
  }

  const defaults = { light: 10, widget: 8, multiagent: 5 };
  const results = [];

  const run = async (m, conc) => {
    if (m === 'light') return scenarioLight(ctx, duration, conc ?? args.concurrency ?? defaults.light);
    if (m === 'widget') return scenarioWidget(ctx, duration, conc ?? args.concurrency ?? defaults.widget);
    if (m === 'multiagent') return scenarioMultiagent(ctx, duration, conc ?? args.concurrency ?? defaults.multiagent);
    throw new Error(`Unknown mode: ${m}`);
  };

  if (mode === 'all') {
    results.push(await run('light'));
    results.push(await run('widget'));
    results.push(await run('multiagent', 5));
  } else {
    results.push(await run(mode));
  }

  console.log('\n=== Summary ===');
  let allOk = true;
  for (const r of results) {
    if (r.skipped) continue;
    const label = r.report?.name || mode;
    console.log(r.ok ? '✓' : '✗', label, r.skipped ? '(skipped)' : '');
    if (!r.ok) allOk = false;
  }

  if (STRICT && !allOk) {
    console.log('\nSTRESS_STRICT=1 → exit 1');
    process.exit(1);
  }
  console.log(allOk ? '\nDone (pass).' : '\nDone with warnings (non-strict).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
