/**
 * Prueba lectura + modificación + validación vía Math-ais (API MCP).
 * Usa AgentePruebaCLI: cambia description y revierte al final.
 *
 *   npx tsx --env-file=.env scripts/probe-math-ais-api-modify.mts [email]
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent, User, Widget } from '../src/lib/db/models.ts';
import { createSessionToken } from '../src/lib/auth.ts';
import { ensureDelegatedApiKey } from '../src/lib/botiva-api-delegation.ts';
import { resolveAgentflowApiUrl } from '../src/lib/agentflow-api-url.ts';

const BASE = (process.env.LOCAL_PROBE_URL || 'http://127.0.0.1:3201').replace(/\/$/, '');
const EMAIL = (process.argv[2] || 'limarle211990@gmail.com').trim().toLowerCase();
const TEST_AGENT_NAME = /AgentePruebaCLI/i;

type AgentRow = { id: string; name: string; description?: string };

async function apiGet(key: string, path: string) {
  const url = `${resolveAgentflowApiUrl()}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  const json = (await res.json()) as { ok?: boolean; data?: unknown };
  return { status: res.status, json };
}

async function chat(
  cookie: string,
  widget: { _id: unknown; afhubToken: string },
  message: string,
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
      sessionId: `api-mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pagePath: '/dashboard/api',
    }),
  });
  return (await res.json()) as {
    reply?: string;
    error?: string;
    toolsUsed?: string[];
  };
}

async function main() {
  await connectDB();
  const user = await User.findOne({ email: EMAIL }).select('_id email displayName');
  if (!user) {
    console.error('NO_USER', EMAIL);
    process.exit(1);
  }
  const userId = String(user._id);
  const apiKey = await ensureDelegatedApiKey(userId);

  const list = await apiGet(apiKey, '/api/v1/agents');
  const agents = (list.json.data || []) as AgentRow[];
  const target = agents.find((a) => TEST_AGENT_NAME.test(a.name || ''));
  if (!target) {
    console.error('NO_TEST_AGENT', 'AgentePruebaCLI no encontrado');
    process.exit(1);
  }

  const before = await apiGet(apiKey, `/api/v1/agents/${target.id}`);
  const beforeDesc = String((before.json.data as AgentRow)?.description || '');
  console.log('TARGET', target.id, target.name);
  console.log('DESC_BEFORE', beforeDesc.slice(0, 120));

  const agent = await ClientAgent.findOne({ agentHubId: 'math-ais' });
  const widget = agent
    ? await Widget.findOne({ agentId: String(agent._id), active: { $ne: false } })
    : null;
  if (!widget?.afhubToken) {
    console.error('NO_MATH_AIS_WIDGET');
    process.exit(1);
  }

  const cookie = `afhub_session=${createSessionToken(userId)}`;
  const stamp = `math-ais-probe-${Date.now()}`;
  const newDesc = `${beforeDesc.replace(/\s*\[math-ais-probe-\d+\]\s*$/, '').trim()} [${stamp}]`.trim();

  const prompt = [
    `Tarea de prueba API (solo AgentePruebaCLI, id ${target.id}):`,
    `1) GET /api/v1/agents/${target.id} y dime la description actual.`,
    `2) PUT /api/v1/agents/${target.id} con body JSON mínimo: {"description":"${newDesc}"} (conserva el resto; solo cambia description).`,
    `3) GET otra vez el mismo agente y confirma que description ahora contiene exactamente "${stamp}".`,
    'Responde con: ANTES | CAMBIO | DESPUÉS | VALIDADO sí/no.',
  ].join('\n');

  const out = await chat(cookie, widget, prompt);
  console.log('\n--- MATH-AIS MODIFY ---');
  console.log('toolsUsed', out.toolsUsed || []);
  console.log('reply', (out.reply || out.error || '').slice(0, 1200));

  const after = await apiGet(apiKey, `/api/v1/agents/${target.id}`);
  const afterDesc = String((after.json.data as AgentRow)?.description || '');
  console.log('\nDESC_AFTER', afterDesc.slice(0, 160));
  const validated = afterDesc.includes(stamp);

  // Revertir
  const revertBody = beforeDesc || 'Agente de prueba CLI';
  await fetch(`${resolveAgentflowApiUrl()}/api/v1/agents/${target.id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ description: revertBody }),
  });
  console.log('REVERTED', revertBody.slice(0, 80));

  const usedWrite = (out.toolsUsed || []).filter((t) => t.includes('botiva_api_request')).length >= 2;
  const ok =
    validated &&
    usedWrite &&
    /VALIDADO\s*(sí|si|yes)/i.test(out.reply || '') &&
    !/reconectando|ECONNREFUSED/i.test(out.reply || '');

  console.log('\n', ok ? 'MODIFY_PROBE_OK' : 'MODIFY_PROBE_FAIL', { validated, usedWrite });
  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
