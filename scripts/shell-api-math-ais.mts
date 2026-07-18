/**
 * Pruebas shell/API Math-ais (sin browser).
 *   npx tsx --env-file=.env scripts/shell-api-math-ais.mts [email]
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent, User, Widget } from '../src/lib/db/models.ts';
import { createSessionToken } from '../src/lib/auth.ts';
import { signRequest, SIGNATURE_HEADER } from '../src/lib/hub-signature.ts';

const BASE = (process.env.LOCAL_PROBE_URL || 'http://127.0.0.1:3201').replace(/\/$/, '');
const HUB = (process.env.AGENTFLOWHUB_URL || 'http://127.0.0.1:9010').replace(/\/$/, '');
const EMAIL = (process.argv[2] || 'limarle211990@gmail.com').trim().toLowerCase();
const HUB_SECRET = process.env.HUB_TO_LANDING_SECRET?.trim() || '';

function ok(label: string, pass: boolean, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  await connectDB();
  const user = await User.findOne({ email: EMAIL }).select('_id email displayName').lean();
  if (!user) {
    console.error('NO_USER', EMAIL);
    process.exit(1);
  }
  const userId = String(user._id);
  const cookie = `afhub_session=${createSessionToken(userId)}`;

  const agent = await ClientAgent.findOne({ agentHubId: 'math-ais' }).lean();
  if (!agent) {
    console.error('NO_MATH_AIS_AGENT');
    process.exit(1);
  }
  const widget = await Widget.findOne({ agentId: String(agent._id), active: { $ne: false } }).lean();
  if (!widget?.afhubToken) {
    console.error('NO_WIDGET');
    process.exit(1);
  }

  console.log('=== Math-ais API probe ===');
  console.log('BASE', BASE);
  console.log('HUB', HUB);
  console.log('USER', EMAIL, userId);
  console.log('AGENT', String(agent._id), 'hubId=', agent.agentHubId, 'syncStatus=', agent.syncStatus);
  console.log('WIDGET', String(widget._id));

  // 1) Boot
  const boot = await fetch(`${BASE}/api/internal/assist/boot?context=app`, {
    headers: { Cookie: cookie },
  });
  let bootJson: { config?: { token?: string }; error?: string } = {};
  try {
    bootJson = await boot.json();
  } catch {
    /* ignore */
  }
  ok('boot', boot.ok && !!bootJson.config?.token, `${boot.status} token=${!!bootJson.config?.token}`);

  // 2) Context
  const ctx = await fetch(`${BASE}/api/internal/assist/context?pagePath=/dashboard`, {
    headers: { Cookie: cookie },
  });
  const ctxJson = (await ctx.json()) as { context?: { name?: string; plan?: string } };
  ok(
    'context',
    ctx.ok && !!ctxJson.context?.name,
    `${ctx.status} name=${ctxJson.context?.name || '?'} plan=${ctxJson.context?.plan || '?'}`,
  );

  const chatBody = (message: string, history: { role: string; content: string }[] = []) =>
    JSON.stringify({
      agentId: String(agent._id),
      widgetId: String(widget._id),
      token: widget.afhubToken,
      message,
      history,
      sessionId: `shell-${Date.now()}`,
      pagePath: '/dashboard',
    });

  // 3) Chat non-stream #1
  const c1 = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE },
    body: chatBody('hola'),
  });
  const r1 = (await c1.json()) as { reply?: string; error?: string; code?: string };
  ok('chat/hola', c1.ok && !!r1.reply, `${c1.status} code=${r1.code || '-'} ${(r1.reply || r1.error || '').slice(0, 80)}`);

  // 4) Chat non-stream #2 (nombre)
  const c2 = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE },
    body: chatBody('sabes como me llamo?', [
      { role: 'user', content: 'hola' },
      { role: 'model', content: r1.reply || 'hola' },
    ]),
  });
  const r2 = (await c2.json()) as { reply?: string; error?: string; code?: string };
  ok(
    'chat/nombre',
    c2.ok && !!r2.reply && !/token inválido|sincronizado/i.test(String(r2.error || r2.reply)),
    `${c2.status} code=${r2.code || '-'} ${(r2.reply || r2.error || '').slice(0, 120)}`,
  );

  // 5) Stream SSE #1
  const s1 = await fetch(`${BASE}/api/widget/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE },
    body: chatBody('hola stream'),
  });
  const s1text = await s1.text();
  const s1err = /"code":"([^"]+)"/.exec(s1text)?.[1] || '';
  const s1reply = /"reply":"([^"]{0,80})/.exec(s1text)?.[1] || s1text.slice(0, 80);
  ok('stream/hola', s1.ok && !/WIDGET_TOKEN_INVALID|AGENT_HUB_SYNC_REQUIRED/.test(s1text), `${s1.status} code=${s1err || '-'} ${s1reply}`);

  // 6) Stream SSE #2
  const s2 = await fetch(`${BASE}/api/widget/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE },
    body: chatBody('sabes como me llamo?', [
      { role: 'user', content: 'hola' },
      { role: 'model', content: 'Hola' },
    ]),
  });
  const s2text = await s2.text();
  const s2err = /"code":"([^"]+)"/.exec(s2text)?.[1] || '';
  const s2reply =
    /"type":"done"[^}]*"reply":"((?:\\.|[^"\\])*)"/.exec(s2text)?.[1]?.replace(/\\n/g, ' ').slice(0, 120) ||
    s2text.slice(0, 150);
  ok(
    'stream/nombre',
    s2.ok && !/WIDGET_TOKEN_INVALID|AGENT_HUB_SYNC_REQUIRED|Error al procesar/.test(s2text) && /done/.test(s2text),
    `${s2.status} code=${s2err || '-'} ${s2reply}`,
  );

  // 7) Hub directo con headers landing (simula proxy)
  if (HUB_SECRET) {
    const hubPayload = JSON.stringify({
      agentId: 'math-ais',
      widgetId: String(widget._id),
      token: widget.afhubToken,
      message: 'ping hub directo',
      history: [],
      sessionId: `hub-${Date.now()}`,
    });
    const hubRes = await fetch(`${HUB}/api/widget/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Widget-Token': String(widget.afhubToken),
        'X-Landing-Wt-Valid': '1',
        'x-hub-sync-secret': HUB_SECRET,
        [SIGNATURE_HEADER]: signRequest(hubPayload, HUB_SECRET),
      },
      body: hubPayload,
    });
    const hubJson = (await hubRes.json()) as { reply?: string; error?: string; code?: string };
    ok(
      'hub/direct',
      hubRes.ok && !!hubJson.reply,
      `${hubRes.status} code=${hubJson.code || '-'} ${(hubJson.reply || hubJson.error || '').slice(0, 80)}`,
    );
  } else {
    ok('hub/direct', false, 'HUB_TO_LANDING_SECRET missing');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
