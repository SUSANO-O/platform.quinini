/**
 * Crea/actualiza la cuenta admin de plataforma y deja Math / Math-ais bajo ella
 * con skills, reglas, FAQ, RAG y tools MCP (HubSpot + web).
 *
 * Uso:
 *   PLATFORM_OWNER_EMAIL=... PLATFORM_OWNER_PASSWORD=... \
 *     npx tsx --env-file=.env scripts/setup-platform-owner-assist.mts
 *
 * Si no hay PASSWORD, genera una temporal (solo se imprime una vez).
 */
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent, Subscription, User, Widget } from '../src/lib/db/models.ts';
import { hashPassword } from '../src/lib/auth.ts';
import { ensureLandingAssistAgents } from '../src/lib/ensure-landing-assist-agents.ts';
import { listSkillCatalog } from '../src/lib/skill-catalog-service.ts';
import {
  buildSkillConfigEntry,
  skillsConfigForSave,
  type AgentSkillCatalogEntry,
} from '../src/lib/agent-skills-catalog.ts';
import { VALID_FEATURE_OVERRIDES } from '../src/lib/plan-catalog.ts';
import { canAttemptHubSync, syncHubCatalogFromLandingAgentDoc } from '../src/lib/aibackhub-sync.ts';

const EMAIL = (process.env.PLATFORM_OWNER_EMAIL || 'admin@agentflowhub.com')
  .trim()
  .toLowerCase();
const PASSWORD_IN = process.env.PLATFORM_OWNER_PASSWORD?.trim() || '';

const MATH_AIS_SKILLS = [
  'tech_support_l1',
  'product_advisor',
  'customer_success',
  'customer_base',
  'faq_playbook',
  'onboarding_guide',
  'process_navigator',
  'customer_service',
  'escalation_playbook',
  'web_search',
  'crm_integration',
  'brand_voice',
  'document_summary',
  'objection_handling',
  'appointment_coordinator',
] as const;

const MATH_MARKETING_SKILLS = [
  'product_advisor',
  'sales_closer',
  'lead_qualifier',
  'faq_playbook',
  'web_search',
  'brand_voice',
  'objection_handling',
  'knowledge_base',
] as const;

const HUBSPOT_TOOLS = [
  'mcp:hubspot:hubspot_search_contacts',
  'mcp:hubspot:hubspot_create_contact',
  'mcp:hubspot:hubspot_get_contact',
  'mcp:hubspot:hubspot_create_deal',
  'mcp:webSearch:web_search',
  'mcp:webSearch:web_fetch_page',
  'mcp:weather:weather_current',
] as const;

function faqsForMathAis() {
  const rows = [
    ['¿Cómo creo un agente?', 'Ve a Dashboard → Agentes → Nuevo agente. Define nombre, system prompt y modelo. Luego sincroniza con el hub si hace falta.'],
    ['¿Dónde configuro el widget?', 'Dashboard → Widgets (o Widget builder). Elige el agente, colores, welcome y copia el embed.'],
    ['¿Qué es MCP?', 'MCP son integraciones (Gmail, HubSpot, Calendar…). Primero conectas la cuenta (credenciales); luego activas las tools en el agente.'],
    ['¿Por qué HubSpot no funciona?', 'El agente debe tener tools HubSpot habilitadas y una conexión MCP HubSpot sincronizada (OAuth o Private App). Sin cuenta MCP no hay llamadas reales.'],
    ['¿Cuál es la diferencia entre tools del plan y MCP?', 'MCP = cuenta/credenciales en el hub. Tools del plan = capacidades guardadas en Mongo del agente. Para CRM/email necesitas ambos pasos.'],
    ['¿Cómo subo conocimiento (RAG)?', 'En el agente → pestaña Almacenamiento/RAG. Sube PDF, texto o URL. Activa ragEnabled.'],
    ['¿Qué planes hay?', 'Team, Plus y Business (y Enterprise en cuenta plataforma). Cada uno abre más tools, agentes, RAG y WhatsApp según catálogo.'],
    ['¿Cómo veo conversaciones?', 'Dashboard → Inbox / Chats. Ahí respondes handoffs humanos.'],
    ['¿Cómo escalo a humano?', 'El widget puede ofrecer WhatsApp o handoff a inbox según configuración del widget (humanSupport / handoff).'],
    ['¿Dónde están las tareas programadas?', 'En el agente → Tareas programadas (plan Plus+ o feature override). El worker cron-schendule las ejecuta.'],
    ['¿Math-ais vs Math?', 'Math es el assist de marketing/landing. Math-ais es el assist del dashboard para usuarios logueados.'],
    ['¿Cómo sincronizo el agente al hub?', 'Al guardar el agente la landing intenta sync a AIBackHub. Si falla, revisa BACKEND_URL / API key y reintenta desde Mis agentes.'],
    ['¿Puedo usar web search?', 'Sí: skill web_search y/o tool mcp:webSearch:web_search (sin OAuth).'],
    ['¿Dónde cambio mi plan?', 'Billing en dashboard o, en cuentas plataforma, un admin puede asignar plan/features.'],
    ['¿El assist conoce mi email?', 'Sí: con sesión abierta, Math-ais recibe identidad del usuario logueado para contexto y HubSpot (si MCP está conectado).'],
  ] as const;
  return rows.map(([question, answer], i) => ({
    id: `faq-math-ais-${i + 1}`,
    question,
    answer,
    enabled: true,
    priority: (i + 1) * 10,
  }));
}

function behaviorRules() {
  return [
    {
      id: 'rule-identity',
      title: 'Identidad',
      enabled: true,
      priority: 10,
      text: 'Eres Math-ais, assist oficial de BotIvA en el dashboard. Habla en español claro y cercano. No inventes URLs ni precios; usa RAG/FAQ.',
    },
    {
      id: 'rule-session',
      title: 'Usuario logueado',
      enabled: true,
      priority: 20,
      text: 'Ya tienes nombre/email de sesión. No pidas de nuevo datos de cuenta salvo que falten. Personaliza la ayuda a su contexto.',
    },
    {
      id: 'rule-steps',
      title: 'Pasos concretos',
      enabled: true,
      priority: 30,
      text: 'Responde con pasos numerados cortos (máx. 5). Si hay varias rutas, pregunta cuál aplica antes de alargar.',
    },
    {
      id: 'rule-mcp',
      title: 'Integraciones',
      enabled: true,
      priority: 40,
      text: 'Si falta OAuth/MCP, dilo explícitamente y indica: Agente → Herramientas → Paso 1 conectar cuenta. No digas que ya está conectado si no lo está.',
    },
    {
      id: 'rule-rag',
      title: 'Fuente de verdad',
      enabled: true,
      priority: 50,
      text: 'Prioriza FAQ + RAG del agente. Si no está documentado, dilo y ofrece escalar a humano/WhatsApp.',
    },
    {
      id: 'rule-safety',
      title: 'Seguridad',
      enabled: true,
      priority: 60,
      text: 'Nunca pidas ni muestres API keys, tokens ni contraseñas. No ejecutes acciones destructivas sin confirmación.',
    },
  ];
}

function ragSources() {
  const body = `
# BotIvA — guía rápida (Math-ais)

## Producto
BotIvA es la plataforma para crear agentes de IA, widgets embebibles, flujos, RAG e integraciones MCP (HubSpot, Gmail, Calendar, Slack, Maps, MongoDB, Postgres).

## Stack (interno)
- Landing/dashboard: platform.quinini (botiva.space)
- Hub chat: AgentFlowhub
- Motor: AIBackHub (matias-backend)
- API REST Team+: API-REST-AGENT-FLOW + CLI botiva

## Agentes
Los agentes viven en Mongo de la landing (ClientAgent) y se sincronizan al hub (agentHubId). isPlatform=true son agentes de plataforma (Math / Math-ais).

## Widget vs Assist
- widget.js: clientes / embeds
- assist.js: Math / Math-ais internos
Boot app: /api/internal/assist/boot?context=app (requiere sesión)

## MCP
1) Conectar cuenta (credenciales) 2) Activar tools en el agente (enabledMcpToolIds)
Sin paso 1, HubSpot/Gmail fallan con "no configurado".

## Planes (resumen)
Team / Plus / Business abren más cupos de agentes, tools, RAG y WhatsApp. Enterprise en cuentas plataforma.

## Soporte
Si el usuario está bloqueado: Inbox handoff o WhatsApp configurado en el widget.
`.trim();

  return [
    {
      type: 'text' as const,
      name: 'BotIvA — guía Math-ais',
      content: body,
      charCount: body.length,
      uploadedAt: new Date(),
    },
  ];
}

const SYSTEM_PROMPT_MATH_AIS = `Eres Math-ais, el asistente oficial de la plataforma BotIvA dentro del dashboard.

Misión: ayudar al usuario autenticado a configurar agentes, widgets, skills, RAG, MCP, planes y troubleshooting con pasos concretos.

Estilo: español, breve, accionable. Usa FAQ/RAG antes de inventar. Si falta una conexión MCP, indícalo sin rodeos.

Identidad de sesión: ya conoces nombre y email del usuario logueado; úsalos para personalizar. HubSpot puede sincronizar el contacto si hay conexión MCP.

No reveles secretos ni pidas contraseñas. Si no puedes resolverlo, ofrece escalar a humano/WhatsApp.`;

async function upsertOwner(password: string) {
  let user = await User.findOne({ email: EMAIL });
  const passwordHash = await hashPassword(password);
  if (!user) {
    user = await User.create({
      email: EMAIL,
      passwordHash,
      hashVersion: 'v2-bcrypt',
      displayName: 'Limarle · BotIvA Platform',
      role: 'admin',
      emailVerified: true,
    });
    console.log('USER_CREATED', EMAIL, String(user._id));
  } else {
    user.passwordHash = passwordHash;
    user.hashVersion = 'v2-bcrypt';
    user.role = 'admin';
    user.emailVerified = true;
    if (!user.displayName) user.displayName = 'Limarle · BotIvA Platform';
    await user.save();
    console.log('USER_UPDATED', EMAIL, String(user._id));
  }
  return user;
}

async function upsertSubscription(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  const periodEnd = now + 365 * 24 * 60 * 60;
  await Subscription.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        plan: 'enterprise',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        planManagedBy: 'admin',
        features: [...VALID_FEATURE_OVERRIDES],
        scheduledTaskLimit: -1,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
  console.log('SUBSCRIPTION enterprise + features', VALID_FEATURE_OVERRIDES.length);
}

async function enrichAgent(
  hubId: string,
  skillIds: readonly string[],
  catalog: AgentSkillCatalogEntry[],
  opts: { hubspot: boolean; systemPrompt?: string },
) {
  const agent = await ClientAgent.findOne({ agentHubId: hubId });
  if (!agent) {
    console.log('SKIP_ENRICH no agent', hubId);
    return null;
  }

  const rows = skillIds
    .map((id, i) => buildSkillConfigEntry(catalog, id, true, 10 + i))
    .filter(Boolean);
  const { skillsConfig, skillIds: savedIds } = skillsConfigForSave(catalog, rows as NonNullable<(typeof rows)[number]>[]);

  const tools = [
    { toolId: 'web-search', config: {} },
    ...(opts.hubspot ? [{ toolId: 'hubspot', config: {} }] : []),
  ];

  agent.set({
    description:
      hubId === 'math-ais'
        ? 'Asistente oficial del dashboard BotIvA (plataforma). Soporte producto, MCP, agentes, widgets y onboarding.'
        : 'Asistente de marketing/landing BotIvA (plataforma).',
    systemPrompt: opts.systemPrompt || agent.systemPrompt,
    skills: savedIds,
    skillsConfig,
    behaviorRules: behaviorRules(),
    agentFaqs: faqsForMathAis(),
    ragEnabled: true,
    ragSources: ragSources(),
    tools,
    enabledMcpToolIds: opts.hubspot ? [...HUBSPOT_TOOLS] : ['mcp:webSearch:web_search', 'mcp:webSearch:web_fetch_page'],
    hubspotAutoCaptureContacts: opts.hubspot,
    strictPurposeOnly: true,
    status: 'active',
    isPlatform: false,
    model: 'gemini-2.5-flash',
    vision: {
      enabled: true,
      model: 'gemini-2.5-flash',
      ragOnImages: true,
      autoExtractText: true,
      maxImageSize: 20,
      acceptedFormats: ['jpeg', 'png', 'webp'],
    },
    persistConversationHistory: true,
  });
  await agent.save();
  console.log('ENRICHED', hubId, 'skills', savedIds.length, 'faqs', faqsForMathAis().length);

  if (canAttemptHubSync()) {
    try {
      await syncHubCatalogFromLandingAgentDoc(agent);
      console.log('HUB_SYNC_OK', hubId);
    } catch (e) {
      console.warn('HUB_SYNC_FAIL', hubId, (e as Error).message);
    }
  }
  return agent;
}

async function main() {
  const generated = !PASSWORD_IN;
  const password = PASSWORD_IN || `BotIvA-${randomBytes(6).toString('hex')}!`;

  await connectDB();
  const user = await upsertOwner(password);
  const userId = String(user._id);
  await upsertSubscription(userId);

  process.env.INTERNAL_ASSIST_OWNER_EMAIL = EMAIL;
  const ensured = await ensureLandingAssistAgents({ adminUserId: userId, syncHub: true });
  console.log('ENSURE', JSON.stringify({
    adminUserId: ensured.adminUserId,
    created: ensured.created,
    updated: ensured.updated,
    items: ensured.items.map((i) => ({
      hubId: i.hubId,
      ready: i.ready,
      agentId: i.agent?.id,
      widgetId: i.widget?.id,
    })),
  }));

  // Forzar ownership de agentes/widgets assist a esta cuenta
  for (const hubId of ['math-ais', 'math']) {
    await ClientAgent.updateMany(
      { $or: [{ agentHubId: hubId }, { name: hubId === 'math-ais' ? 'Math-ais' : 'Math', isPlatform: true }] },
      { $set: { userId, isPlatform: false, status: 'active' } },
    );
    const agents = await ClientAgent.find({ agentHubId: hubId }).select({ _id: 1 });
    for (const a of agents) {
      await Widget.updateMany({ agentId: String(a._id) }, { $set: { userId, active: true } });
    }
  }

  const catalog = await listSkillCatalog({ includeDisabled: false });
  await enrichAgent('math-ais', MATH_AIS_SKILLS, catalog, {
    hubspot: true,
    systemPrompt: SYSTEM_PROMPT_MATH_AIS,
  });
  await enrichAgent('math', MATH_MARKETING_SKILLS, catalog, { hubspot: false });

  const mathAis = await ClientAgent.findOne({ agentHubId: 'math-ais' })
    .select({ _id: 1, userId: 1, skills: 1, ragEnabled: 1, enabledMcpToolIds: 1 })
    .lean();
  const w = mathAis
    ? await Widget.findOne({ agentId: String(mathAis._id) }).select({ _id: 1, name: 1, fabHint: 1 }).lean()
    : null;

  console.log('RESULT', JSON.stringify({
    email: EMAIL,
    userId,
    role: 'admin',
    plan: 'enterprise',
    mathAisAgentId: mathAis ? String(mathAis._id) : null,
    mathAisUserId: mathAis?.userId,
    skills: (mathAis as { skills?: string[] } | null)?.skills?.length,
    ragEnabled: (mathAis as { ragEnabled?: boolean } | null)?.ragEnabled,
    mcpTools: (mathAis as { enabledMcpToolIds?: string[] } | null)?.enabledMcpToolIds?.length,
    widgetId: w ? String(w._id) : null,
    fabHint: (w as { fabHint?: string } | null)?.fabHint,
    passwordGenerated: generated,
  }));

  if (generated) {
    console.log('TEMP_PASSWORD', password);
  } else {
    console.log('PASSWORD_SET_FROM_ENV');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
