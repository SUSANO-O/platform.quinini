import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationFlow } from '@/lib/db/models';
import { flowAccessDeniedMessage, resolveFlowAccessFromRequest } from '@/lib/flow-access';
import { listRecentFlowConversations } from '@/lib/flow-stats';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const access = await resolveFlowAccessFromRequest(req);
  if (!access) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!access.hasAccess) {
    return NextResponse.json({ error: flowAccessDeniedMessage(), code: 'FLOW_PLAN_REQUIRED' }, { status: 403 });
  }

  const { userId } = access;

  const { id } = await ctx.params;
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 10)));

  await connectDB();
  const flow = await ConversationFlow.findOne({ _id: id, userId }).select({ _id: 1 }).lean();
  if (!flow) return NextResponse.json({ error: 'Flujo no encontrado.' }, { status: 404 });

  const conversations = await listRecentFlowConversations(id, userId, limit);
  return NextResponse.json({ conversations });
}
