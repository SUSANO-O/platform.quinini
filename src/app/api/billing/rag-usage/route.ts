import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription } from '@/lib/db/models';
import { getAgentLimits } from '@/lib/agent-plans';

type RagSourceLike = {
  fileSize?: unknown;
  charCount?: unknown;
  content?: unknown;
};

function estimateSourceBytes(src: RagSourceLike): number {
  const fileSize = Number(src.fileSize ?? 0);
  if (Number.isFinite(fileSize) && fileSize > 0) return fileSize;

  const charCount = Number(src.charCount ?? 0);
  if (Number.isFinite(charCount) && charCount > 0) return Math.round(charCount * 2);

  if (typeof src.content === 'string' && src.content.length > 0) {
    return Math.round(src.content.length * 2);
  }

  return 0;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();

  const sub = await Subscription.findOne({ userId }).select({ plan: 1, status: 1 }).lean() as
    | { plan?: string; status?: string }
    | null;
  const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
  const limits = getAgentLimits(plan);

  const agents = await ClientAgent.find({
    userId,
    type: 'agent',
    $or: [{ isPlatform: false }, { isPlatform: { $exists: false } }],
  })
    .select({ _id: 1, name: 1, ragEnabled: 1, ragSources: 1 })
    .sort({ updatedAt: -1 })
    .lean() as Array<{
    _id: { toString(): string };
    name?: string;
    ragEnabled?: boolean;
    ragSources?: RagSourceLike[];
  }>;

  const maxSources = Math.max(0, limits.ragSourcesPerAgent);
  const maxBytes = Math.max(0, limits.ragStorageMbPerAgent) * 1024 * 1024;

  const perAgent = agents.map((a) => {
    const sources = Array.isArray(a.ragSources) ? a.ragSources : [];
    const usedSources = sources.length;
    const usedBytes = sources.reduce((acc, s) => acc + estimateSourceBytes(s), 0);
    const percentSources = maxSources > 0 ? Math.min(100, Math.round((usedSources / maxSources) * 100)) : 0;
    const percentStorage = maxBytes > 0 ? Math.min(100, Math.round((usedBytes / maxBytes) * 100)) : 0;
    return {
      id: a._id.toString(),
      name: a.name || 'Agente sin nombre',
      ragEnabled: Boolean(a.ragEnabled),
      usedSources,
      usedBytes,
      percentSources,
      percentStorage,
    };
  });

  const totals = perAgent.reduce(
    (acc, row) => {
      acc.usedSources += row.usedSources;
      acc.usedBytes += row.usedBytes;
      return acc;
    },
    { usedSources: 0, usedBytes: 0 },
  );

  return NextResponse.json({
    plan,
    ragEnabled: limits.ragEnabled,
    maxSourcesPerAgent: maxSources,
    maxStorageMbPerAgent: Math.max(0, limits.ragStorageMbPerAgent),
    totals,
    perAgent,
  });
}
