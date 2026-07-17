/**
 * Parchea Math-ais: onboarding post-creación de agente (FAQ, reglas, RAG, prompt).
 *
 *   npx tsx --env-file=.env scripts/patch-math-ais-onboarding.mts
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent } from '../src/lib/db/models.ts';
import { canAttemptHubSync, syncHubCatalogFromLandingAgentDoc } from '../src/lib/aibackhub-sync.ts';
import {
  MATH_AIS_SYSTEM_PROMPT,
  mathAisBehaviorRules,
  mathAisFaqs,
  mathAisRagSources,
} from '../src/lib/math-ais-content.ts';

async function main() {
  await connectDB();

  const agent = await ClientAgent.findOne({ agentHubId: 'math-ais' });
  if (!agent) {
    console.error('NO_AGENT math-ais');
    process.exit(1);
  }

  agent.set({
    systemPrompt: MATH_AIS_SYSTEM_PROMPT,
    behaviorRules: mathAisBehaviorRules(),
    agentFaqs: mathAisFaqs(),
    ragEnabled: true,
    ragSources: mathAisRagSources(),
  });
  await agent.save();

  console.log('PATCHED', {
    id: String(agent._id),
    faqs: mathAisFaqs().length,
    rules: mathAisBehaviorRules().length,
    promptLen: MATH_AIS_SYSTEM_PROMPT.length,
  });

  if (canAttemptHubSync()) {
    try {
      await syncHubCatalogFromLandingAgentDoc(agent);
      console.log('HUB_SYNC_OK');
    } catch (e) {
      console.warn('HUB_SYNC_FAIL', (e as Error).message);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
