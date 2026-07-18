/**
 * Repara syncStatus de Math-ais si el agente existe en el catálogo del hub.
 *   npx tsx --env-file=.env scripts/repair-math-ais-sync.mts
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent } from '../src/lib/db/models.ts';
import { fetchCatalogAgentFromHub, syncHubCatalogFromLandingAgentDoc } from '../src/lib/aibackhub-sync.ts';

async function main() {
  await connectDB();
  const agent = await ClientAgent.findOne({ agentHubId: 'math-ais' });
  if (!agent) {
    console.error('NO_AGENT');
    process.exit(1);
  }
  const hubId = 'math-ais';
  await syncHubCatalogFromLandingAgentDoc(agent).catch(() => {});
  const inHub = await fetchCatalogAgentFromHub(hubId);
  if (inHub?.id) {
    await ClientAgent.updateOne({ _id: agent._id }, { syncStatus: 'synced', agentHubId: inHub.id });
    console.log('SYNCED', String(agent._id), inHub.id);
  } else {
    console.log('HUB_NOT_FOUND', hubId);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
