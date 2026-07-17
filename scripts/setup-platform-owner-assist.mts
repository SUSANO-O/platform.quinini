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
import {
  MATH_AIS_SYSTEM_PROMPT,
  mathAisBehaviorRules,
  mathAisFaqs,
  mathAisRagSources,
} from '../src/lib/math-ais-content.ts';

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
    behaviorRules: mathAisBehaviorRules(),
    agentFaqs: mathAisFaqs(),
    ragEnabled: true,
    ragSources: mathAisRagSources(),
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
  console.log('ENRICHED', hubId, 'skills', savedIds.length, 'faqs', mathAisFaqs().length);

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
    systemPrompt: MATH_AIS_SYSTEM_PROMPT,
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
