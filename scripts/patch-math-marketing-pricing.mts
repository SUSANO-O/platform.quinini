/**
 * Actualiza Math (marketing): prompt, FAQs, RAG y web_fetch_page para precios dinámicos.
 *
 *   npx tsx --env-file=.env scripts/patch-math-marketing-pricing.mts
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import {
  MATH_MARKETING_SYSTEM_PROMPT,
  mathMarketingBehaviorRules,
  mathMarketingFaqs,
  mathMarketingRagSources,
} from '../src/lib/math-marketing-content.ts';
import { mathMarketingMcpToolIds } from '../src/lib/math-marketing-mcp.ts';
import { ClientAgent } from '../src/lib/db/models.ts';
import { canAttemptHubSync, syncHubCatalogFromLandingAgentDoc } from '../src/lib/aibackhub-sync.ts';

const MATH_HUB = (process.env.INTERNAL_MARKETING_ASSIST_AGENT_ID || 'math').trim() || 'math';

async function main() {
  await connectDB();
  const agent = await ClientAgent.findOne({
    $or: [{ agentHubId: MATH_HUB }, { name: 'Math', agentHubId: MATH_HUB }],
  });
  if (!agent) {
    console.error('NO math marketing agent — ejecuta ensure landing assist primero');
    process.exit(1);
  }
  agent.set({
    systemPrompt: MATH_MARKETING_SYSTEM_PROMPT,
    behaviorRules: mathMarketingBehaviorRules(),
    agentFaqs: mathMarketingFaqs(),
    ragEnabled: true,
    ragSources: mathMarketingRagSources(),
    enabledMcpToolIds: mathMarketingMcpToolIds(),
    strictPurposeOnly: true,
  });
  await agent.save();
  if (canAttemptHubSync()) {
    await syncHubCatalogFromLandingAgentDoc(agent);
  }
  console.log('PATCHED math marketing pricing', String(agent._id), 'faqs', mathMarketingFaqs().length);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
