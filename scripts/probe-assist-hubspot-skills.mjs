/**
 * Probe Math-ais: HubSpot tools + skills + chat with visitor identity.
 * Uso: node --env-file=/tmp/botiva-probe.env scripts/probe-assist-hubspot-skills.mjs
 */
import mongoose from 'mongoose';
import { readFileSync } from 'fs';

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const i = line.indexOf('=');
      if (i <= 0) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}
loadEnvFile('/tmp/botiva-probe.env');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI missing');
  process.exit(1);
}

const backend = (process.env.BACKEND_URL || process.env.AIBACKHUB_URL || 'http://127.0.0.1:9003').replace(
  /\/$/,
  '',
);
const apiKey = process.env.AIBACKHUB_API_KEY || '';

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const agent = await db.collection('clientagents').findOne({
    $or: [{ agentHubId: 'math-ais' }, { name: 'Math-ais', isPlatform: true }],
  });
  if (!agent) {
    console.log(JSON.stringify({ ok: false, error: 'NO_AGENT_MATH_AIS' }));
    process.exit(1);
  }
  const widget = await db
    .collection('widgets')
    .find({ agentId: String(agent._id) })
    .sort({ createdAt: 1 })
    .limit(1)
    .next();

  const mcp = (agent.enabledMcpToolIds || []).map(String);
  const hubspotTools = mcp.filter((t) => t.includes('hubspot'));
  const skills = Array.isArray(agent.skills) ? agent.skills : [];
  const skillsConfig = Array.isArray(agent.skillsConfig) ? agent.skillsConfig : [];
  const skillsEnabled = skillsConfig.filter((s) => s && s.enabled !== false).map((s) => s.id);

  const cfg = {
    agentId: String(agent._id),
    agentHubId: agent.agentHubId,
    hubspotAutoCapture: agent.hubspotAutoCaptureContacts === true,
    hubspotTools,
    mcpToolCount: mcp.length,
    skills,
    skillsEnabled,
    skillsConfigCount: skillsConfig.length,
    widgetId: widget ? String(widget._id) : null,
    hasWt: Boolean(widget?.afhubToken && String(widget.afhubToken).startsWith('wt_')),
  };
  console.log('CONFIG', JSON.stringify(cfg, null, 2));

  // Asegurar flag+tools si faltan (probe local / prep)
  const needTools = [
    'mcp:hubspot:hubspot_search_contacts',
    'mcp:hubspot:hubspot_create_contact',
  ];
  const missing = needTools.filter((t) => !hubspotTools.includes(t));
  if (!cfg.hubspotAutoCapture || missing.length) {
    const merged = [...new Set([...mcp, ...needTools])];
    await db.collection('clientagents').updateOne(
      { _id: agent._id },
      {
        $set: {
          hubspotAutoCaptureContacts: true,
          enabledMcpToolIds: merged,
        },
      },
    );
    console.log('FIXED_AGENT', { hubspotAutoCapture: true, addedTools: missing });
  }

  // Usuario de prueba: wikos si existe, si no el más reciente no-admin
  let user =
    (await db.collection('users').findOne({ email: /wikos/i })) ||
    (await db
      .collection('users')
      .find({ role: { $ne: 'admin' } })
      .sort({ createdAt: -1 })
      .limit(1)
      .next());
  if (!user?.email) {
    console.log('NO_USER');
    await mongoose.disconnect();
    return;
  }
  const name = user.displayName || String(user.email).split('@')[0];
  const email = String(user.email).toLowerCase();
  console.log('TEST_USER', { email, name, id: String(user._id) });

  // Chat MCP directo a AIBackHub (prod o local)
  const health = await fetch(`${backend}/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  console.log('BACKEND_HEALTH', health);

  const history = [
    {
      role: 'user',
      content: `Me llamo ${name}. Mi email es ${email}.`,
    },
  ];
  const body = {
    agentId: agent.agentHubId || 'math-ais',
    message: 'Hola, ¿qué skills tienes activas y puedes confirmar mi email?',
    history,
    model: agent.model || 'gemini-2.5-flash',
    systemPrompt: agent.systemPrompt || '',
    enabledToolIds: [...new Set([...(agent.enabledMcpToolIds || []), ...needTools])],
    replyProvider: 'vertex',
    hubspotAutoCaptureContacts: true,
    visitorEmail: email,
    visitorName: name,
  };

  const res = await fetch(`${backend}/api/mcp/widget-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-tenant-id': String(agent.userId || 'default'),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  console.log('CHAT_HTTP', res.status);
  const reply = json?.data?.text || json?.text || json?.reply || json?.error || '';
  console.log('REPLY', String(reply).slice(0, 500));
  console.log('TOOLS_USED', json?.data?.toolsUsed || json?.toolsUsed || []);
  console.log(
    'HUBSPOT_HINT',
    /HubSpot|contacto/i.test(String(reply)) ? 'mention_in_reply' : 'no_hubspot_phrase_in_reply',
  );
  console.log(
    'SKILLS_HINT',
    /skill|capacidad|herramienta|mcp|hubspot/i.test(String(reply)) ? 'mentions_capabilities' : 'generic',
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
