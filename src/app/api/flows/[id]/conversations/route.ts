import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ConversationFlow } from '@/lib/db/models';
import { listRecentFlowConversations } from '@/lib/flow-stats';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await ctx.params;
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 10)));

  await connectDB();
  const flow = await ConversationFlow.findOne({ _id: id, userId }).select({ _id: 1 }).lean();
  if (!flow) return NextResponse.json({ error: 'Flujo no encontrado.' }, { status: 404 });

  const conversations = await listRecentFlowConversations(id, userId, limit);
  return NextResponse.json({ conversations });
}
