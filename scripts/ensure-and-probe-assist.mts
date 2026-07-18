/**
 * 1) Asegura Math + Math-ais (HubSpot en app)
 * 2) Añade skills de prueba a Math-ais
 * 3) Chat de prueba con visitor identity → HubSpot + skills
 */
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent, User } from '../src/lib/db/models.ts';
import { ensureLandingAssistAgents } from '../src/lib/ensure-landing-assist-agents.ts';
import mongoose from 'mongoose';

async function main() {
  await connectDB();
  const ensured = await ensureLandingAssistAgents({ syncHub: true });
  console.log(
    'ENSURED',
    JSON.stringify(
      {
        admin: ensured.adminUserId,
        created: ensured.created,
        updated: ensured.updated,
        items: ensured.items.map((i) => ({
          context: i.context,
          hubId: i.hubId,
          ready: i.ready,
          agentId: i.agent?.id,
          widgetId: i.widget?.id,
        })),
      },
      null,
      2,
    ),
  );

  const agent = await ClientAgent.findOne({ agentHubId: 'math-ais' });
  if (!agent) {
    console.log('FAIL no math-ais after ensure');
    process.exit(1);
  }

  // Skills de prueba (CRM + soporte) sin romper HubSpot tools
  const skillIds = ['sales_closer', 'tech_support_l1', 'crm_integration'];
  const existingSkills = Array.isArray(agent.skills) ? agent.skills.map(String) : [];
  const existingTools = Array.isArray(agent.enabledMcpToolIds)
    ? agent.enabledMcpToolIds.map(String)
    : [];
  const hubspotTools = [
    'mcp:hubspot:hubspot_search_contacts',
    'mcp:hubspot:hubspot_create_contact',
  ];
  agent.skills = [...new Set([...existingSkills, ...skillIds])].slice(0, 20);
  agent.hubspotAutoCaptureContacts = true;
  agent.enabledMcpToolIds = [...new Set([...existingTools, ...hubspotTools])];
  agent.markModified('skills');
  agent.markModified('enabledMcpToolIds');
  await agent.save();
  console.log('AGENT_SKILLS', {
    skills: agent.skills,
    hubspot: agent.hubspotAutoCaptureContacts,
    tools: agent.enabledMcpToolIds.filter((t) => String(t).includes('hubspot')),
  });

  const user =
    (await User.findOne({ email: /wikos/i }).select({ email: 1, displayName: 1 }).lean()) ||
    (await User.findOne({ role: { $ne: 'admin' } })
      .sort({ createdAt: -1 })
      .select({ email: 1, displayName: 1 })
      .lean());
  if (!user?.email) {
    console.log('NO_USER');
    process.exit(1);
  }
  const email = String(user.email).toLowerCase();
  const name = String(user.displayName || email.split('@')[0]);
  console.log('TEST_USER', { email, name });

  const apiKey = process.env.AIBACKHUB_API_KEY || '';
  const tenantId = String(agent.userId);
  const backends = [
    (process.env.BACKEND_URL || 'http://127.0.0.1:9003').replace(/\/$/, ''),
    'https://matias-backend-528082765109.europe-west1.run.app',
  ].filter((v, i, a) => a.indexOf(v) === i);

  const body = {
    agentId: 'math-ais',
    message:
      'Hola. Confirma mi email de cliente y dime qué skills/capacidades tienes activas (nombres). Sé breve.',
    history: [{ role: 'user' as const, content: `Me llamo ${name}. Mi email es ${email}.` }],
    model: 'gemini-2.5-flash',
    systemPrompt: agent.systemPrompt || '',
    enabledToolIds: agent.enabledMcpToolIds,
    replyProvider: 'vertex',
    hubspotAutoCaptureContacts: true,
    visitorEmail: email,
    visitorName: name,
  };

  for (const backend of backends) {
    console.log('TRY_BACKEND', backend);
    const res = await fetch(`${backend}/api/mcp/widget-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    console.log('CHAT_RAW', JSON.stringify(json).slice(0, 1200));
    const data = (json.data && typeof json.data === 'object' ? json.data : json) as Record<
      string,
      unknown
    >;
    const reply = String(
      data.text ||
        data.reply ||
        (typeof json.error === 'string'
          ? json.error
          : JSON.stringify(json.error || json.message || '')),
    );
    const toolsUsed = data.toolsUsed || [];
    console.log('CHAT_HTTP', res.status);
    console.log('REPLY', reply.slice(0, 800));
    console.log('TOOLS_USED', toolsUsed);
    console.log('CHECKS', {
      hubspotInReply: /hubspot|contacto/i.test(reply),
      emailInReply: reply.toLowerCase().includes(email.toLowerCase()) || reply.includes(name),
      skillsInReply: /skill|soporte|ventas|hubspot|crm|capacidad|pipeline/i.test(reply),
      hubspotToolUsed: Array.isArray(toolsUsed)
        ? toolsUsed.some((t) => String(t).includes('hubspot'))
        : false,
    });
    if (res.ok) break;
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
