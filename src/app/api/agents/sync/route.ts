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
import {
  canAttemptHubSync,
  getAibackhubBaseUrl,
  hubCreateHeaders,
  parseCreatedAgentId,
} from '@/lib/aibackhub-sync';

async function syncAgent(agent: {
  _id: { toString(): string };
  userId: string;
  name: string;
  description?: string;
  systemPrompt: string;
  model: string;
  tools?: Array<{ toolId: string; config?: Record<string, string> }>;
  ragEnabled?: boolean;
  ragSources?: Array<{ type: string; name: string; content: string }>;
  type?: 'agent' | 'sub-agent';
  parentAgentId?: string | null;
  widgetPublicToken?: string | null;
  isPlatform?: boolean;
}): Promise<{ success: boolean; hubId?: string }> {
  if (!canAttemptHubSync()) {
    return { success: false };
  }
  const baseUrl = getAibackhubBaseUrl();

  const description = (agent.description ?? '').trim();

  const wt = typeof agent.widgetPublicToken === 'string' ? agent.widgetPublicToken.trim() : '';
  const payload: Record<string, unknown> = {
    name: agent.name,
    description,
    prompt: agent.systemPrompt,
    model: agent.model,
    hasWidget: Boolean(wt),
    source: 'landing',
    landingClientAgentId: agent._id.toString(),
    ragEnabled: Boolean(agent.ragEnabled),
    ragSources: Array.isArray(agent.ragSources) ? agent.ragSources : [],
    catalogAgentType: agent.type === 'sub-agent' ? 'sub-agent' : 'agent',
  };
  if (wt) payload.widgetPublicToken = wt;
  if (agent.type === 'sub-agent' && agent.parentAgentId && /^[a-f0-9]{24}$/i.test(agent.parentAgentId)) {
    payload.landingParentClientAgentId = agent.parentAgentId;
  }
  if (agent.isPlatform === true) {
    payload.isPlatform = true;
  }

  try {
    const res = await fetch(`${baseUrl}/api/agents`, {
      method: 'POST',
      headers: hubCreateHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      const data = await res.json();
      const hubId = parseCreatedAgentId(data);
      return { success: true, hubId };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

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
    const { success, hubId } = await syncAgent(agent as Parameters<typeof syncAgent>[0]);
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
