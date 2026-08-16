#!/usr/bin/env node
/**
 * Prueba que el agente de laboratorio (admin) usa skills de producto.
 *
 *   node --env-file=.env scripts/probe-lab-skills.mjs
 *   BASE_URL=https://botiva.space node --env-file=.env scripts/probe-lab-skills.mjs
 *
 * No imprime tokens. No crea contactos HubSpot (solo busca/cita/inventario).
 */
import { createConnection, Types } from 'mongoose';
import {
  loadWidgetTestEnv,
  getBaseUrl,
  getAibackhubUrl,
  aibackhubHeaders,
  DEFAULT_WIDGET_ID,
  DEFAULT_AGENT_ID,
} from './lib/load-env.mjs';

loadWidgetTestEnv();

const BASE = getBaseUrl();
const BACKEND = getAibackhubUrl();
const WIDGET_ID = process.env.WIDGET_ID || DEFAULT_WIDGET_ID;
const AGENT_ID = process.env.AGENT_ID || DEFAULT_AGENT_ID;
const LEAK_RE =
  /plataforma de hubspot|autorizaci[oó]n de accesos|permisos granulares|crm\.objects|inconveniente t[eé]cnico de permisos/i;

const CASES = [
  {
    id: 'hola',
    message: 'Hola',
    expectLeak: false,
    note: 'saludo: camino liviano, skills apagadas',
  },
  {
    id: 'inventario',
    message:
      '¿Tienen el amortiguador delantero izquierdo para Chevrolet Tracker 2017 marca Gabriel? Precio y stock.',
    expectLeak: false,
    expectTools: /sheet/i,
    note: 'catálogo: skills sí, sales_closer no',
  },
  {
    id: 'cita',
    message: 'Quiero agendar una cita en el taller para el jueves a las 10.',
    expectLeak: false,
    note: 'operacional: skills de cierre/calendario permitidas',
  },
];

let passed = 0;
let failed = 0;

function ok(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function resolveSkills(skillIds, skillsConfig, excludeSkillIds) {
  const res = await fetch(`${BACKEND}/api/agents/resolve-skill-context`, {
    method: 'POST',
    headers: aibackhubHeaders('lab-skills-probe'),
    body: JSON.stringify({
      baseSystemPrompt: 'Eres el lab de pruebas.',
      baseEnabledToolIds: [],
      skillIds,
      skillsConfig,
      ...(excludeSkillIds ? { excludeSkillIds } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  const data = json.data && typeof json.data === 'object' ? json.data : json;
  return { status: res.status, data };
}

async function widgetChat(token, agentId, message) {
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      widgetId: WIDGET_ID,
      agentId,
      message,
      sessionId: `lab_skills_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => ({}));
  const reply = String(json.reply || json.text || json.error || '');
  const toolsUsed = Array.isArray(json.toolsUsed) ? json.toolsUsed.map(String) : [];
  return { status: res.status, reply, toolsUsed, error: json.error };
}

async function main() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.error('Falta MONGODB_URI');
    process.exit(1);
  }

  console.log(`Landing ${BASE}`);
  console.log(`Motor   ${BACKEND}`);
  console.log(`Widget  ${WIDGET_ID}`);
  console.log(`Agent   ${AGENT_ID}`);

  const conn = await createConnection(uri).asPromise();
  let token = '';
  let taller = null;
  let closer = null;
  try {
    const w = await conn.db.collection('widgets').findOne({ _id: new Types.ObjectId(WIDGET_ID) });
    token = w?.afhubToken || '';
    ok('widget tiene token wt_', typeof token === 'string' && token.startsWith('wt_'));

    taller = await conn.db.collection('clientagents').findOne({ _id: new Types.ObjectId(AGENT_ID) });
    ok('agente lab existe', Boolean(taller), taller ? String(taller.name || '') : '');

    if (taller) {
      const closerId = Array.isArray(taller.subAgentIds) ? String(taller.subAgentIds[0] || '') : '';
      if (closerId && Types.ObjectId.isValid(closerId)) {
        closer = await conn.db.collection('clientagents').findOne({ _id: new Types.ObjectId(closerId) });
      }
      if (!closer) {
        closer = await conn.db.collection('clientagents').findOne({
          name: 'Lab Closer (fixture)',
          userId: taller.userId,
        });
      }
    }
  } finally {
    await conn.close();
  }

  const skills = Array.isArray(taller?.skills) ? taller.skills.map(String) : [];
  const skillsConfig = Array.isArray(taller?.skillsConfig) ? taller.skillsConfig : [];
  const enabled = skillsConfig
    .filter((s) => s && s.enabled !== false && s.id)
    .map((s) => String(s.id));
  const closerSkills = Array.isArray(closer?.skills) ? closer.skills.map(String) : [];
  const closerCfg = Array.isArray(closer?.skillsConfig)
    ? closer.skillsConfig.filter((s) => s && s.enabled !== false).map((s) => String(s.id))
    : [];

  console.log('\n--- Mongo (ids only) ---');
  console.log('taller.name', taller?.name);
  console.log('taller.skills', skills);
  console.log('taller.skillsConfig enabled', enabled);
  console.log('closer.name', closer?.name || '(none)');
  console.log('closer.skills', closerSkills);
  console.log('closer.skillsConfig enabled', closerCfg);

  const hasAnySkill = enabled.length > 0 || skills.length > 0 || closerCfg.length > 0;
  ok('lab tiene al menos una skill', hasAnySkill);

  const mergeIds = enabled.length ? enabled : skills;
  const mergeCfg = skillsConfig.length
    ? skillsConfig
    : mergeIds.map((id) => ({ id, enabled: true }));

  console.log('\n--- resolve-skill-context (motor) ---');
  const full = await resolveSkills(mergeIds, mergeCfg);
  ok('resolve HTTP 200', full.status === 200, `status=${full.status}`);
  const applied = Array.isArray(full.data?.appliedSkills)
    ? full.data.appliedSkills.map((s) => s.id)
    : [];
  const prompt = String(full.data?.systemPrompt || '');
  const tools = Array.isArray(full.data?.enabledToolIds) ? full.data.enabledToolIds : [];
  console.log('appliedSkills', applied);
  console.log('enabledToolIds', tools.slice(0, 12), tools.length > 12 ? `…+${tools.length - 12}` : '');
  ok('merge aplica skills', applied.length > 0 || !hasAnySkill);
  if (applied.includes('sales_closer') || mergeIds.includes('sales_closer')) {
    ok('prompt incluye bloque SKILL', /### SKILL:/i.test(prompt));
  }

  const inv = await resolveSkills(mergeIds, mergeCfg, [
    'sales_closer',
    'objection_handling',
    'lead_qualifier',
  ]);
  const appliedInv = Array.isArray(inv.data?.appliedSkills)
    ? inv.data.appliedSkills.map((s) => s.id)
    : [];
  console.log('appliedSkills (inventario, sin cierre)', appliedInv);
  ok(
    'inventario excluye sales_closer',
    !appliedInv.includes('sales_closer'),
  );

  console.log('\n--- widget chat ---');
  for (const c of CASES) {
    console.log(`\n[${c.id}] ${c.note}`);
    const r = await widgetChat(token, AGENT_ID, c.message);
    const leak = LEAK_RE.test(r.reply);
    console.log(`  http=${r.status} tools=${r.toolsUsed.join(',') || '—'} reply=${r.reply.slice(0, 180).replace(/\s+/g, ' ')}`);
    ok(`${c.id} HTTP 200`, r.status === 200 && !r.error, r.error ? String(r.error).slice(0, 80) : '');
    ok(`${c.id} sin leak HubSpot`, !leak);
    if (c.expectTools) {
      const hit = r.toolsUsed.some((t) => c.expectTools.test(t));
      ok(`${c.id} usó tool esperada`, hit, hit ? '' : 'ninguna sheet en toolsUsed');
    }
  }

  console.log(`\n${passed} pass / ${failed} fail`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
