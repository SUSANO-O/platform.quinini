/**
 * Prueba local Math-ais: contexto + chat + Mongo MCP.
 *   npx tsx --env-file=.env scripts/probe-math-ais-local.mts [email]
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent, User, Widget } from '../src/lib/db/models.ts';
import { createSessionToken } from '../src/lib/auth.ts';
import { getAssistMongoMcpStatus } from '../src/lib/assist-mongo-mcp-service.ts';

const BASE = (process.env.LOCAL_PROBE_URL || 'http://127.0.0.1:3201').replace(/\/$/, '');
const EMAIL = (process.argv[2] || 'limarle211990@gmail.com').trim().toLowerCase();

async function main() {
  await connectDB();
  const user = await User.findOne({ email: EMAIL }).select('_id email displayName');
  if (!user) {
    console.error('NO_USER', EMAIL);
    process.exit(1);
  }
  const userId = String(user._id);
  const token = createSessionToken(userId);
  const cookie = `afhub_session=${token}`;

  const agent = await ClientAgent.findOne({ agentHubId: 'math-ais' });
  const widget = agent
    ? await Widget.findOne({ agentId: String(agent._id), active: { $ne: false } })
    : null;
  if (!widget?.afhubToken) {
    console.error('NO_MATH_AIS_WIDGET');
    process.exit(1);
  }

  console.log('USER', EMAIL, userId);
  console.log('WIDGET', String(widget._id), widget.afhubToken.slice(0, 14) + '…');

  const mongoSt = await getAssistMongoMcpStatus();
  console.log('MONGO_MCP', mongoSt.connection?.syncStatus, mongoSt.connection?.allowedDatabases);

  // 1) Boot
  const boot = await fetch(`${BASE}/api/internal/assist/boot?context=app`, {
    headers: { Cookie: cookie },
  });
  console.log('BOOT', boot.status, boot.ok ? 'ok' : await boot.text());

  // 2) Context API
  const ctxRes = await fetch(`${BASE}/api/internal/assist/context?pagePath=/dashboard/agents`, {
    headers: { Cookie: cookie },
  });
  const ctxText = await ctxRes.text();
  let ctxJson: { context?: { name?: string; plan?: string; agents?: { total?: number } }; error?: string } = {};
  try {
    ctxJson = JSON.parse(ctxText);
  } catch {
    console.log('CONTEXT', ctxRes.status, 'non-json', ctxText.slice(0, 80));
  }
  if (ctxJson.context) {
    console.log(
      'CONTEXT',
      ctxRes.status,
      ctxJson.context.name,
      ctxJson.context.plan,
      ctxJson.context.agents?.total,
    );
  } else if (ctxRes.status !== 200) {
    console.log('CONTEXT', ctxRes.status, ctxJson.error || ctxText.slice(0, 120));
  }

  // 3) Chat — saludo
  const chat1 = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: BASE,
    },
    body: JSON.stringify({
      agentId: 'math-ais',
      widgetId: String(widget._id),
      token: widget.afhubToken,
      message: 'hola',
      history: [],
      sessionId: `probe-${Date.now()}`,
      pagePath: '/dashboard/agents',
    }),
  });
  const r1 = await chat1.json();
  console.log('CHAT_HOLA', chat1.status, (r1.reply || r1.error || '').slice(0, 200));

  // 4) Chat — ya creé agente
  const chat2 = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: BASE,
    },
    body: JSON.stringify({
      agentId: 'math-ais',
      widgetId: String(widget._id),
      token: widget.afhubToken,
      message: 'ya creé mi agente, qué sigue',
      history: [
        { role: 'user', content: 'quiero crear mi agente' },
        {
          role: 'model',
          content: 'Ve a Dashboard → Agentes → Nuevo agente…',
        },
      ],
      sessionId: `probe-${Date.now()}-2`,
      pagePath: '/dashboard/agents',
    }),
  });
  const r2 = await chat2.json();
  console.log('CHAT_ONBOARD', chat2.status, (r2.reply || r2.error || '').slice(0, 350));
  if (r2.toolsUsed?.length) console.log('TOOLS', r2.toolsUsed);

  await mongoose.disconnect();
  const ok =
    boot.ok &&
    ctxRes.ok &&
    chat1.ok &&
    chat2.ok &&
    typeof r2.reply === 'string' &&
    !/BACKEND_URL|sync hub|agentfarm/i.test(r2.reply) &&
    (ctxJson.context?.name || r2.reply.includes('Genial') || r2.reply.includes('genial'));
  console.log(ok ? 'PROBE_OK' : 'PROBE_FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
