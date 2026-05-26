/**
 * GET /api/agents/[id]/memory-stats — estadísticas de memoria del agente (RAG + conversacional).
 */

import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription, WidgetSessionContext } from '@/lib/db/models';
import { hubFetch, hubCreateHeaders } from '@/lib/aibackhub-sync';
import { historyRetentionDays } from '@/lib/widget-memory-plan';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  await connectDB();
  const agent = await ClientAgent.findOne({
    _id: id,
    $or: [{ userId }, { isPlatform: true }],
  })
    .select({ agentHubId: 1, ragSources: 1, name: 1 })
    .lean();

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
  let conversationMemories = 0;
  let vectorTotal = 0;

  if (hubId) {
    try {
      const res = await hubFetch(
        `/api/embeddings/stats/${encodeURIComponent(hubId)}`,
        { method: 'GET', headers: hubCreateHeaders() },
        12_000,
      );
      if (res.ok) {
        const json = (await res.json()) as {
          data?: { totalVectors?: number; totalFiles?: number };
        };
        vectorTotal = Number(json.data?.totalVectors ?? 0);
      }
    } catch {
      /* hub opcional */
    }

    try {
      const countRes = await hubFetch(
        `/api/embeddings/memory/count/${encodeURIComponent(hubId)}`,
        { method: 'GET', headers: hubCreateHeaders() },
        8_000,
      );
      if (countRes.ok) {
        const cj = (await countRes.json()) as { data?: { count?: number } };
        if (typeof cj.data?.count === 'number') conversationMemories = cj.data.count;
      }
    } catch {
      /* optional */
    }
  }

  const sessionContexts = await WidgetSessionContext.countDocuments({ userId });

  const sub = await Subscription.findOne({ userId }).select({ plan: 1, status: 1 }).lean();
  const active =
    sub?.status === 'active' || sub?.status === 'trialing' || sub?.status === 'past_due';
  const plan = active ? (sub?.plan ?? 'free') : 'free';

  const ragSources = Array.isArray(agent.ragSources) ? agent.ragSources.length : 0;

  return NextResponse.json({
    agentId: id,
    agentHubId: hubId || null,
    conversationMemories,
    vectorTotal,
    ragSources,
    activeSessionContexts: sessionContexts,
    historyRetentionDays: historyRetentionDays(plan),
    plan,
  });
}
