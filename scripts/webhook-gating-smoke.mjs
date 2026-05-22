#!/usr/bin/env node
/**
 * Smoke E2E — gating de webhooks (agente + saliente HMAC).
 *
 * Requiere: dev server (`npm run dev`), MONGODB_URI y JWT_SECRET (misma .env que la app).
 *
 *   node --env-file=.env scripts/webhook-gating-smoke.mjs
 *
 * Opcional:
 *   BASE_URL=http://localhost:3201
 *   TEST_WEBHOOK_ECHO_URL=https://webhook.site/...  — echo HTTPS (default en .env.example)
 */

import crypto from 'crypto';
import { createConnection, Types } from 'mongoose';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3201').replace(/\/$/, '');
const MONGO_URI = process.env.MONGODB_URI || '';
const JWT_SECRET = (process.env.JWT_SECRET || 'dev-secret-change-me').trim();
const DEFAULT_ECHO_URL = 'https://webhook.site/68c7194c-8b87-402b-8641-9c8fd8e7240a';
const ECHO_URL = (process.env.TEST_WEBHOOK_ECHO_URL || DEFAULT_ECHO_URL).trim();

const TAG = `smoke-wh-${Date.now()}`;
const PASSWORD = 'SmokeTest!123';

let passed = 0;
let failed = 0;
let skipped = 0;
let conn;
let User;
let Subscription;
let ClientAgent;
let Widget;

const createdUserIds = [];
const createdWidgetIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function green(t) { return `\x1b[32m${t}\x1b[0m`; }
function red(t) { return `\x1b[31m${t}\x1b[0m`; }
function yellow(t) { return `\x1b[33m${t}\x1b[0m`; }

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function webhookSiteToken(url) {
  const m = url.match(/webhook\.site\/([a-f0-9-]+)/i);
  return m?.[1] || '';
}

async function check(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    console.log(green('✓ PASS'));
    passed++;
  } catch (err) {
    console.log(red('✗ FAIL') + ` — ${err.message}`);
    failed++;
  }
}

function skip(name, reason) {
  console.log(`  ${name} ... ${yellow('⊘ SKIP')} (${reason})`);
  skipped++;
}

function createSessionToken(userId) {
  const payload = `${userId}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

function sha256Password(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function api(method, path, { cookie, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = `afhub_session=${cookie}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function waitForWebhookPost(tokenId, { event, userId, timeoutMs = 20_000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(
      `https://webhook.site/token/${tokenId}/requests?sorting=newest&per_page=15`,
    );
    const j = await res.json();
    for (const row of j.data || []) {
      if (row.method !== 'POST' || !row.content) continue;
      try {
        const body = JSON.parse(row.content);
        if (body.event === event && body.userId === userId) {
          const sigHeader = row.headers?.['x-BotIvA-signature']?.[0]
            || row.headers?.['X-BotIvA-Signature']?.[0];
          return { body, signature: sigHeader || null };
        }
      } catch {
        /* siguiente request */
      }
    }
    await sleep(1500);
  }
  throw new Error(`no llegó POST ${event} para userId ${userId} en ${timeoutMs}ms`);
}

async function ensureDb() {
  if (!MONGO_URI) throw new Error('MONGODB_URI no definida (usa --env-file=.env).');
  conn = await createConnection(MONGO_URI).asPromise();
  const loose = { strict: false };
  User = conn.model('User', new conn.base.Schema({}, loose));
  Subscription = conn.model('Subscription', new conn.base.Schema({}, loose));
  ClientAgent = conn.model('ClientAgent', new conn.base.Schema({}, loose));
  Widget = conn.model('Widget', new conn.base.Schema({}, loose));
}

async function createTestUser(suffix, { plan, status }) {
  const email = `${TAG}-${suffix}@BotIvA-smoke.test`;
  const passwordHash = sha256Password(PASSWORD);
  const user = await User.create({
    email,
    passwordHash,
    hashVersion: 'v1-sha256',
    displayName: `Smoke ${suffix}`,
    emailVerified: true,
    role: 'user',
  });
  const userId = user._id.toString();
  createdUserIds.push(userId);

  if (plan && plan !== 'free') {
    await Subscription.create({
      userId,
      plan,
      status: status || 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return { userId, email, token: createSessionToken(userId) };
}

async function cleanup() {
  if (!conn || createdUserIds.length === 0) return;
  if (createdWidgetIds.length) {
    await Widget.deleteMany({ _id: { $in: createdWidgetIds.map((id) => new Types.ObjectId(id)) } });
  }
  await ClientAgent.deleteMany({ userId: { $in: createdUserIds } });
  await Subscription.deleteMany({ userId: { $in: createdUserIds } });
  await User.deleteMany({ _id: { $in: createdUserIds.map((id) => new Types.ObjectId(id)) } });
}

const minimalAgent = {
  name: 'Smoke Agent',
  systemPrompt: 'Eres un agente de prueba.',
  model: 'gemini-2.0-flash',
  tools: [{ toolId: 'webhook', config: { url: 'https://example.com/hook' } }],
};

async function main() {
  console.log(`\n🔍 Webhook gating E2E → ${BASE_URL}`);
  console.log(`   Echo URL: ${ECHO_URL}`);
  console.log('─'.repeat(52));

  await check('Dev server responde /api/status', async () => {
    const res = await fetch(`${BASE_URL}/api/status`);
    assert(res.status === 200, `status ${res.status}`);
    const j = await res.json();
    assert(typeof j.status === 'string', 'sin campo status');
    assert(['operational', 'degraded'].includes(j.status), `status=${j.status}`);
  });

  await ensureDb();

  const freeUser = await createTestUser('free', { plan: 'free' });
  const plusUser = await createTestUser('plus', { plan: 'plus', status: 'active' });
  const soloUser = await createTestUser('solo', { plan: 'solo', status: 'active' });
  const starterUser = await createTestUser('starter', { plan: 'starter', status: 'active' });

  console.log('\n[SaaS webhook saliente — GET/PATCH]');

  await check('GET Plus → allowed=false, minPlan=starter', async () => {
    const { status, json } = await api('GET', '/api/user/saas-webhook', { cookie: plusUser.token });
    assert(status === 200, `status ${status}`);
    assert(json.allowed === false, `allowed=${json.allowed}`);
    assert(json.minPlan === 'starter', `minPlan=${json.minPlan}`);
    assert(typeof json.minPlanLabel === 'string' && json.minPlanLabel.length > 0, 'sin minPlanLabel');
  });

  await check('PATCH Plus → 403 OUTBOUND_WEBHOOK_REQUIRES_STARTER', async () => {
    const { status, json } = await api('PATCH', '/api/user/saas-webhook', {
      cookie: plusUser.token,
      body: { url: 'https://example.com/outbound' },
    });
    assert(status === 403, `status ${status}`);
    assert(json.code === 'OUTBOUND_WEBHOOK_REQUIRES_STARTER', `code=${json.code}`);
  });

  await check('GET Starter → allowed=true', async () => {
    const { status, json } = await api('GET', '/api/user/saas-webhook', { cookie: starterUser.token });
    assert(status === 200, `status ${status}`);
    assert(json.allowed === true, `allowed=${json.allowed}`);
  });

  await check('PATCH Starter → 200 y URL guardada (webhook.site)', async () => {
    const { status, json } = await api('PATCH', '/api/user/saas-webhook', {
      cookie: starterUser.token,
      body: { url: ECHO_URL },
    });
    assert(status === 200, `status ${status} ${JSON.stringify(json)}`);
    assert(json.ok === true, 'ok !== true');
    assert(json.url === ECHO_URL, `url=${json.url}`);

    const u = await User.findById(starterUser.userId).lean();
    assert(u?.saasWebhookUrl === ECHO_URL, 'no persistió en Mongo');
    assert(u?.saasWebhookSecret?.length > 8, 'sin secreto HMAC');
  });

  await check('PATCH rechaza HTTP (no HTTPS)', async () => {
    const { status, json } = await api('PATCH', '/api/user/saas-webhook', {
      cookie: starterUser.token,
      body: { url: 'http://insecure.example/hook' },
    });
    assert(status === 400, `status ${status}`);
    assert(/HTTPS/i.test(json.error || ''), json.error || 'sin mensaje');
  });

  await check('GET sin cookie → 401', async () => {
    const { status } = await api('GET', '/api/user/saas-webhook');
    assert(status === 401, `status ${status}`);
  });

  console.log('\n[Webhook del agente — POST /api/agents]');

  await check('Free + tool webhook → 403', async () => {
    const { status, json } = await api('POST', '/api/agents', {
      cookie: freeUser.token,
      body: minimalAgent,
    });
    assert(status === 403, `status ${status}`);
    assert(/webhook/i.test(json.error || ''), json.error || 'sin error');
  });

  let starterAgentId = null;

  await check('Solo + tool webhook → 201', async () => {
    const { status, json } = await api('POST', '/api/agents', {
      cookie: soloUser.token,
      body: { ...minimalAgent, name: 'Smoke Solo Webhook' },
    });
    assert(status === 201, `status ${status} ${JSON.stringify(json)}`);
    assert(json.agent?._id || json.agent?.id, 'sin agent id');
    const tools = json.agent?.tools || [];
    assert(tools.some((t) => t.toolId === 'webhook'), 'webhook no en tools');
  });

  await check('Starter agente para entrega outbound', async () => {
    const { status, json } = await api('POST', '/api/agents', {
      cookie: starterUser.token,
      body: { ...minimalAgent, name: 'Smoke Starter Delivery', tools: [] },
    });
    assert(status === 201, `status ${status}`);
    starterAgentId = json.agent?._id || json.agent?.id;
    assert(starterAgentId, 'sin agent id');
  });

  console.log('\n[Entrega outbound — widget_closed → webhook.site]');

  const siteToken = webhookSiteToken(ECHO_URL);
  if (!siteToken) {
    skip('Entrega real', 'ECHO_URL no es webhook.site');
  } else {
    await check('widget_closed dispara POST con HMAC a webhook.site', async () => {
      assert(starterAgentId, 'falta agente starter');

      const widget = await Widget.create({
        userId: starterUser.userId,
        name: 'Smoke Delivery Widget',
        agentId: String(starterAgentId),
      });
      createdWidgetIds.push(widget._id.toString());

      const res = await fetch(`${BASE_URL}/api/widget/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'widget_closed',
          agentId: String(starterAgentId),
          instanceId: `smoke-${TAG}`,
          timestamp: new Date().toISOString(),
        }),
      });
      assert(res.status === 200, `events status ${res.status}`);

      const delivery = await waitForWebhookPost(siteToken, {
        event: 'conversation.closed',
        userId: starterUser.userId,
      });
      assert(delivery.body?.data?.agentId === String(starterAgentId), 'agentId no coincide');
      assert(delivery.signature?.startsWith('sha256='), `sin firma HMAC (${delivery.signature})`);

      const u = await User.findById(starterUser.userId).lean();
      const secret = u?.saasWebhookSecret || '';
      const bodyStr = JSON.stringify(delivery.body);
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
      assert(delivery.signature === expected, 'firma HMAC inválida');
    });
  }

  console.log('\n[UI compliance — HTML estático]');
  await check('GET /dashboard/compliance redirige o responde (no 500)', async () => {
    const res = await fetch(`${BASE_URL}/dashboard/compliance`, { redirect: 'manual' });
    assert(res.status < 500, `status ${res.status}`);
  });
}

main()
  .catch((err) => {
    console.error('\nError fatal:', err);
    failed++;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (e) {
      console.error('Cleanup error:', e.message);
    }
    if (conn) await conn.close();

    console.log('\n' + '─'.repeat(52));
    console.log(`Resultados: ${green(String(passed))} pass, ${failed ? red(String(failed)) : '0'} fail, ${skipped} skip`);
    if (failed > 0) process.exit(1);
    console.log(green('✅ Smoke E2E webhooks OK'));
  });
