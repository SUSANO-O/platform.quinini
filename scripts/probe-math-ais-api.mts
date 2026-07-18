/**
 * Prueba MCP API REST en Math-ais (perfil limarle211990 por defecto).
 *   npx tsx --env-file=.env scripts/probe-math-ais-api.mts [email]
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent, Subscription, User, Widget } from '../src/lib/db/models.ts';
import { createSessionToken } from '../src/lib/auth.ts';
import { getAssistApiMcpStatus } from '../src/lib/assist-api-mcp-service.ts';
import { canUseApiAccess } from '../src/lib/plan-catalog.ts';

const BASE = (process.env.LOCAL_PROBE_URL || 'http://127.0.0.1:3201').replace(/\/$/, '');
const EMAIL = (process.argv[2] || 'limarle211990@gmail.com').trim().toLowerCase();

async function chat(
  cookie: string,
  widget: { _id: unknown; afhubToken: string },
  message: string,
  pagePath = '/dashboard/api',
) {
  const res = await fetch(`${BASE}/api/widget/chat`, {
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
      message,
      history: [],
      sessionId: `api-probe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      pagePath,
    }),
  });
  const j = (await res.json()) as {
    reply?: string;
    error?: string;
    toolsUsed?: string[];
    code?: string;
  };
  return { status: res.status, ...j };
}

async function main() {
  await connectDB();
  const user = await User.findOne({ email: EMAIL }).select('_id email displayName');
  if (!user) {
    console.error('NO_USER', EMAIL);
    process.exit(1);
  }
  const userId = String(user._id);
  const sub = (await Subscription.findOne({ userId }).lean()) as {
    plan?: string;
    status?: string;
    features?: string[];
  } | null;
  const plan = String(sub?.plan || 'free');
  const subStatus = String(sub?.status || 'none');
  const apiAccess = canUseApiAccess(plan, subStatus, sub?.features);
  console.log('USER', EMAIL, userId, 'plan=', plan, 'status=', subStatus, 'apiAccess=', apiAccess);

  const agent = await ClientAgent.findOne({ agentHubId: 'math-ais' });
  const widget = agent
    ? await Widget.findOne({ agentId: String(agent._id), active: { $ne: false } })
    : null;
  if (!widget?.afhubToken) {
    console.error('NO_MATH_AIS_WIDGET');
    process.exit(1);
  }

  const apiSt = await getAssistApiMcpStatus();
  console.log(
    'API_MCP',
    'toolsEnabled=',
    apiSt.apiToolsEnabled,
    'sync=',
    apiSt.connection?.syncStatus,
    'apiHealthy=',
    apiSt.apiHealthy,
  );

  const cookie = `afhub_session=${createSessionToken(userId)}`;

  const q1 = await chat(
    cookie,
    widget,
    '¿Está activa mi API REST? Usa la herramienta botiva_api_health si la tienes y dime el resultado exacto.',
  );
  console.log('\n--- API_HEALTH ---');
  console.log('HTTP', q1.status);
  console.log('toolsUsed', q1.toolsUsed || []);
  console.log('reply', (q1.reply || q1.error || '').slice(0, 700));

  const q2 = await chat(
    cookie,
    widget,
    'Lista mis agentes con la API REST: GET /api/v1/agents. Dime cuántos hay y los nombres.',
  );
  console.log('\n--- API_AGENTS ---');
  console.log('HTTP', q2.status);
  console.log('toolsUsed', q2.toolsUsed || []);
  console.log('reply', (q2.reply || q2.error || '').slice(0, 900));

  const usedApiTool = [...(q1.toolsUsed || []), ...(q2.toolsUsed || [])].some((t) =>
    t.includes('botiva_api'),
  );
  const ok =
    q1.status === 200 &&
    q2.status === 200 &&
    apiSt.apiToolsEnabled &&
    apiAccess &&
    usedApiTool &&
    !/reconectando|BACKEND_URL|ECONNREFUSED/i.test(`${q1.reply}${q2.reply}`);

  console.log('\n', ok ? 'API_PROBE_OK' : 'API_PROBE_FAIL');
  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
