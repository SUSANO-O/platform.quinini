/**
 * Configura MCP MongoDB para Math-ais (solo lectura, contexto del cliente logueado).
 *
 *   ASSIST_MONGO_URI='mongodb+srv://...' npx tsx --env-file=.env scripts/setup-math-ais-mongo.mts
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { ensureAssistMongoMcpConnection, resolveAssistMongoUri } from '../src/lib/assist-mongo-mcp-service.ts';
import {
  MATH_AIS_SYSTEM_PROMPT,
  mathAisBehaviorRules,
  mathAisFaqs,
  mathAisRagSources,
} from '../src/lib/math-ais-content.ts';
import { ClientAgent } from '../src/lib/db/models.ts';
import { canAttemptHubSync, syncHubCatalogFromLandingAgentDoc } from '../src/lib/aibackhub-sync.ts';

const uri = resolveAssistMongoUri(process.argv[2] || process.env.ASSIST_MONGO_URI);

async function patchMathAisContent() {
  const agent = await ClientAgent.findOne({ agentHubId: 'math-ais' });
  if (!agent) {
    console.error('NO math-ais agent');
    process.exit(1);
  }
  agent.set({
    systemPrompt: MATH_AIS_SYSTEM_PROMPT,
    behaviorRules: mathAisBehaviorRules(),
    agentFaqs: mathAisFaqs(),
    ragEnabled: true,
    ragSources: mathAisRagSources(),
    hubspotAutoCaptureContacts: false,
  });
  await agent.save();
  if (canAttemptHubSync()) {
    await syncHubCatalogFromLandingAgentDoc(agent);
  }
  console.log('PATCHED math-ais content', String(agent._id));
}

async function main() {
  if (!uri) {
    console.error('Falta ASSIST_MONGO_URI o argumento URI');
    process.exit(1);
  }
  await connectDB();
  await patchMathAisContent();
  const result = await ensureAssistMongoMcpConnection({ connectionUri: uri });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
