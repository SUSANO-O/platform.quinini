#!/usr/bin/env node
/**
 * Harness completo: inventario + MCP + triaje + reglas/FAQ/RAG (config Mongo).
 *
 *   BASE_URL=https://botiva.space node --env-file=.env scripts/widget-harness-inventory.mjs
 *   BASE_URL=http://127.0.0.1:3201 node --env-file=.env scripts/widget-harness-inventory.mjs
 */
import { createConnection, Types } from 'mongoose';
import { loadWidgetTestEnv, getBaseUrl, DEFAULT_WIDGET_ID, DEFAULT_AGENT_ID } from './lib/load-env.mjs';

loadWidgetTestEnv();

const BASE = getBaseUrl();
const WIDGET_ID = process.env.WIDGET_ID || DEFAULT_WIDGET_ID;
const AGENT_ID = process.env.AGENT_ID || DEFAULT_AGENT_ID;

const CASES = [
  {
    id: 'h1-tracker',
    layer: 'MCP:sheet',
    message:
      'Buenas tardes. ¿Tiene el amortiguador delantero izquierdo para una Chevrolet Tracker 2017? El mecánico me dijo que la marca Gabriel sale buena.',
    expectTools: [/sheet/i],
    expectNoHandoff: true,
  },
  {
    id: 'h2-oem',
    layer: 'MCP:sheet',
    message:
      "Disponibilidad de la referencia OEM 'PE5R-18-110'. ¿De qué repuesto es y para qué marca?",
    expectTools: [/sheet/i],
  },
  {
    id: 'h3-explicit',
    layer: 'triaje+sheet',
    message:
      'Busca en el inventario de la hoja de ventas: amortiguador delantero izquierdo Chevrolet Tracker 2017 marca Gabriel. Dime referencia, stock y sede.',
    expectTools: [/sheet/i],
    expectRouted: '69d5084c78e0af3d5536fe95',
  },
  {
    id: 'h4-sede',
    layer: 'rules+sheet',
    message:
      'Amortiguadores delanteros Tracker en Sede Norte Pasillo C, cliente en Sede Sur. ¿Qué hacemos?',
    expectTools: [/sheet/i],
    expectReply: /par|pareja|dos|ambos/i,
  },
];

async function loadHarnessConfig(uri) {
  const conn = await createConnection(uri).asPromise();
  try {
    const agent = await conn.db.collection('clientagents').findOne(
      { _id: new Types.ObjectId(AGENT_ID) },
      {
        projection: {
          name: 1,
          model: 1,
          agentHubId: 1,
          systemPrompt: 1,
          tools: 1,
          enabledMcpToolIds: 1,
          skills: 1,
          skillsConfig: 1,
          ragEnabled: 1,
          behaviorRules: 1,
          agentFaqs: 1,
          subAgents: 1,
          multiAgentConfig: 1,
        },
      },
    );
    const widget = await conn.db.collection('widgets').findOne(
      { _id: new Types.ObjectId(WIDGET_ID) },
      { projection: { name: 1, afhubToken: 1, multiAgentEnabled: 1, orchestratorAgentIds: 1 } },
    );
    return { agent, widget };
  } finally {
    await conn.close();
  }
}

function extractSheetsFromAgent(agent) {
  const out = [];
  for (const t of agent?.tools || []) {
    if (t?.toolId !== 'google-sheets') continue;
    const cfg = t.config;
    const sheets = cfg?.sheets;
    if (Array.isArray(sheets)) {
      for (const s of sheets) {
        if (s?.name) out.push(String(s.name));
      }
    }
  }
  return out;
}

function summarizeHarness(agent) {
  if (!agent) return {};
  const sheets = extractSheetsFromAgent(agent);
  const tools = (agent.tools || []).map((t) => t.toolId).filter(Boolean);
  const mcps = (agent.enabledMcpToolIds || []).slice(0, 12);
  const skills = (agent.skillsConfig || agent.skills || [])
    .filter((s) => s?.enabled !== false)
    .map((s) => (typeof s === 'string' ? s : s.id || s.name))
    .filter(Boolean);
  const rules = Array.isArray(agent.behaviorRules) ? agent.behaviorRules.length : 0;
  const faqs = Array.isArray(agent.agentFaqs) ? agent.agentFaqs.length : 0;
  return {
    name: agent.name,
    hubId: agent.agentHubId,
    model: agent.model,
    sheets,
    hasSheetTool: sheets.length > 0,
    builtinTools: tools,
    mcpTools: mcps,
    skills,
    ragEnabled: Boolean(agent.ragEnabled),
    behaviorRulesCount: rules,
    faqCount: faqs,
    subAgents: (agent.subAgents || []).map((s) => s.name || s.agentId),
  };
}

async function chat(token, message, sessionId) {
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Widget-Token': token },
    body: JSON.stringify({
      agentId: AGENT_ID,
      widgetId: WIDGET_ID,
      token,
      message,
      sessionId,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function checkCase(c, reply, tools, multiAgent) {
  const issues = [];
  if (c.expectTools) {
    for (const pat of c.expectTools) {
      if (!tools.some((t) => pat.test(String(t)))) issues.push(`falta tool ${pat}`);
    }
  }
  if (c.expectRouted && multiAgent?.routedAgentId !== c.expectRouted) {
    issues.push(`routed=${multiAgent?.routedAgentId} esperaba ${c.expectRouted}`);
  }
  if (c.expectNoHandoff && multiAgent?.handoff) {
    issues.push(`handoff inesperado → ${multiAgent?.routedAgentName}`);
  }
  if (c.expectReply && !c.expectReply.test(reply || '')) {
    issues.push('reply no cumple patrón esperado');
  }
  if (/especialista de producto|no tengo acceso al inventario|d[eé]jame tus datos|nombre, n[uú]mero de tel[eé]fono y correo|pedir[eé] a uno de nuestros especialistas|financiar tu pr[oó]ximo veh[ií]culo|estrenar un veh[ií]culo/i.test(reply || '')) {
    issues.push('respuesta deflectiva post-inventario');
  }
  return issues;
}

const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  console.error('Falta MONGODB_URI');
  process.exit(1);
}

const { agent, widget } = await loadHarnessConfig(uri);
const token = String(widget?.afhubToken || process.env.WIDGET_TOKEN || '');
if (!token) {
  console.error('Sin token widget');
  process.exit(1);
}

console.log('\n📋 HARNESS CONFIG (Mongo)');
console.log(JSON.stringify(summarizeHarness(agent), null, 2));
console.log(`\nWidget: ${widget?.name} | multiAgent: ${widget?.multiAgentEnabled}`);
console.log(`URL: ${BASE}\n`);

let pass = 0;
let fail = 0;

for (const c of CASES) {
  const sid = `harness-${c.id}-${Date.now()}`;
  const { status, json } = await chat(token, c.message, sid);
  const reply = typeof json.reply === 'string' ? json.reply : '';
  const tools = Array.isArray(json.toolsUsed) ? json.toolsUsed : [];
  const ma = json.multiAgent || null;
  const issues = checkCase(c, reply, tools, ma);

  console.log('─'.repeat(72));
  console.log(`[${c.layer}] ${c.id} → ${issues.length ? 'FAIL' : 'PASS'}`);
  console.log(`HTTP ${status} | tools: ${tools.join(', ') || '(ninguna)'}`);
  if (ma) console.log(`multiAgent: ${JSON.stringify(ma)}`);
  if (issues.length) console.log('issues:', issues.join('; '));
  console.log(`P: ${c.message.slice(0, 90)}…`);
  console.log(`R: ${reply.slice(0, 420)}${reply.length > 420 ? '…' : ''}`);

  if (issues.length) fail++;
  else pass++;
}

console.log('\n' + '═'.repeat(72));
console.log(`Harness: ${pass} PASS, ${fail} FAIL / ${CASES.length}`);
console.log(
  fail === 0
    ? '✅ Harness OK — MCP/triaje orquestando inventario.'
    : '❌ Revisar deploy (landing + AIBackHub) o config agente.',
);
process.exit(fail > 0 ? 1 : 0);
