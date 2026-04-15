/**
 * POST /api/agents/sync
 * Retries syncing pending/failed agents to AgentFlowHub backend.
 * Called on-demand or by a cron job.
 * Requires valid session (any authenticated user syncs their own agents).
 * Admin can pass ?all=true to sync everyone's pending agents.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, ClientAgent } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { postCreateLandingAgentOnHubCatalog } from '@/lib/aibackhub-sync';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();

  const user = await User.findById(userId, { role: 1 }).lean() as { role?: string } | null;
  const isAdmin = user?.role === 'admin';
  const syncAll = isAdmin && req.nextUrl.searchParams.get('all') === 'true';

  // Find agents to sync
  const filter = syncAll
    ? { syncStatus: { $in: ['pending', 'failed'] } }
    : { userId, syncStatus: { $in: ['pending', 'failed'] } };

  const agents = await ClientAgent.find(filter).limit(50).lean();

  let synced = 0;
  let failed = 0;

  for (const agent of agents) {
    if ((agent as { isPlatform?: boolean }).isPlatform) {
      continue;
    }
    const { success, hubId } = await postCreateLandingAgentOnHubCatalog(
      agent as Parameters<typeof postCreateLandingAgentOnHubCatalog>[0],
    );
    if (success) {
      const update: { syncStatus: 'synced'; agentHubId?: string } = { syncStatus: 'synced' };
      if (hubId) update.agentHubId = hubId;
      await ClientAgent.updateOne({ _id: agent._id }, update);
      synced++;
    } else {
      await ClientAgent.updateOne({ _id: agent._id }, { syncStatus: 'failed' });
      failed++;
    }
  }

  return NextResponse.json({ synced, failed, total: agents.length });
}
