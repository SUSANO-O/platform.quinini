/**
 * Prueba track HubSpot + skills a la vez (agente con MCP HubSpot vivo).
 */
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent, User } from '../src/lib/db/models.ts';
import mongoose from 'mongoose';

async function chat(backend: string, apiKey: string, tenantId: string, body: Record<string, unknown>) {
  const res = await fetch(`${backend.replace(/\/$/, '')}/api/mcp/widget-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-tenant-id': tenantId,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const data = (json.data && typeof json.data === 'object' ? json.data : json) as Record<
    string,
    unknown
  >;
  return {
    status: res.status,
    raw: json,
    reply: String(data.text || data.reply || JSON.stringify(json.error || json)),
    toolsUsed: (data.toolsUsed as string[]) || [],
  };
}

async function main() {
  await connectDB();
  const agent = await ClientAgent.findOne({
    hubspotAutoCaptureContacts: true,
    isPlatform: { $ne: true },
    enabledMcpToolIds: { $in: ['mcp:hubspot:hubspot_search_contacts'] },
  }).sort({ updatedAt: -1 });
  if (!agent) {
    console.log('NO_HS_AGENT');
    process.exit(1);
  }

  const user =
    (await User.findOne({ email: /wikos/i }).lean()) ||
    (await User.findById(agent.userId).lean());
  const email = String((user as { email?: string })?.email || 'probe@botiva.space').toLowerCase();
  const name = String(
    (user as { displayName?: string })?.displayName || email.split('@')[0] || 'Cliente',
  );

  console.log('AGENT', {
    id: String(agent._id),
    name: agent.name,
    hub: agent.agentHubId,
    skills: agent.skills,
    hs: agent.hubspotAutoCaptureContacts,
  });
  console.log('VISITOR', { email, name });

  const apiKey = process.env.AIBACKHUB_API_KEY || '';
  const backends = [
    (process.env.BACKEND_URL || 'http://127.0.0.1:9003').replace(/\/$/, ''),
    'https://matias-backend-528082765109.europe-west1.run.app',
  ].filter((v, i, a) => a.indexOf(v) === i);

  const body = {
    agentId: String(agent.agentHubId || agent._id),
    message:
      'Hola. Soy cliente de BotIvA. Confirma mi email y di en una frase qué skill de ventas tienes (sales_closer u otra).',
    history: [{ role: 'user', content: `Me llamo ${name}. Mi email es ${email}.` }],
    model: agent.model || 'gemini-2.5-flash',
    systemPrompt: agent.systemPrompt || '',
    enabledToolIds: agent.enabledMcpToolIds || [],
    replyProvider: 'vertex',
    hubspotAutoCaptureContacts: true,
    visitorEmail: email,
    visitorName: name,
  };

  for (const backend of backends) {
    console.log('TRY', backend);
    const r = await chat(backend, apiKey, String(agent.userId), body);
    console.log('HTTP', r.status);
    console.log('REPLY', r.reply.slice(0, 700));
    console.log('TOOLS', r.toolsUsed);
    const ok =
      r.status === 200 &&
      (r.reply.toLowerCase().includes(email) ||
        r.reply.includes(name) ||
        /contacto|hubspot|skill|ventas|closer/i.test(r.reply));
    console.log('PASS_SIGNAL', {
      ok,
      hubspotTool: r.toolsUsed.some((t) => t.includes('hubspot')),
      hubspotPhrase: /hubspot|contacto/i.test(r.reply),
      skillsPhrase: /skill|ventas|closer|soporte|crm/i.test(r.reply),
      identityPhrase: r.reply.toLowerCase().includes(email) || r.reply.includes(name),
    });
    if (r.status === 200) break;
  }

  // Math-ais status (track listo en Mongo; falta OAuth HubSpot del admin)
  const math = await ClientAgent.findOne({ agentHubId: 'math-ais' }).lean();
  console.log('MATH_AIS', {
    exists: Boolean(math),
    hs: (math as { hubspotAutoCaptureContacts?: boolean } | null)?.hubspotAutoCaptureContacts,
    skills: (math as { skills?: string[] } | null)?.skills,
    tools: ((math as { enabledMcpToolIds?: string[] } | null)?.enabledMcpToolIds || []).filter((t) =>
      String(t).includes('hubspot'),
    ),
    note: 'Para el bubble ¿Tienes dudas? hace falta conectar HubSpot OAuth en el agente Math-ais (admin) y sync.',
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
