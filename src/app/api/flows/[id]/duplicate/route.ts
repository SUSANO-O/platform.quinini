import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationFlow } from '@/lib/db/models';
import { flowLimitForPlan } from '@/lib/flow-admin';
import { flowAccessDeniedMessage, resolveFlowAccessFromRequest } from '@/lib/flow-access';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const access = await resolveFlowAccessFromRequest(req);
  if (!access) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!access.hasAccess) {
    return NextResponse.json({ error: flowAccessDeniedMessage(), code: 'FLOW_PLAN_REQUIRED' }, { status: 403 });
  }

  const { userId } = access;

  const { id } = await ctx.params;
  await connectDB();

  const source = await ConversationFlow.findOne({ _id: id, userId }).lean();
  if (!source) return NextResponse.json({ error: 'Flujo no encontrado.' }, { status: 404 });

  const limit = flowLimitForPlan(access.plan, access.status, access.features);
  if (limit >= 0) {
    const used = await ConversationFlow.countDocuments({ userId, workspaceId: source.workspaceId });
    if (used >= limit) {
      return NextResponse.json({
        error: `Límite de flujos alcanzado (${used}/${limit}).`,
        code: 'FLOW_LIMIT',
      }, { status: 403 });
    }
  }

  const copy = await ConversationFlow.create({
    userId: source.userId,
    workspaceId: source.workspaceId,
    orgId: source.orgId,
    name: `${source.name} (copia)`,
    status: 'draft',
    description: source.description,
    tags: source.tags,
    embedToken: `ft_${randomBytes(20).toString('hex')}`,
    generatesLeads: source.generatesLeads,
    enabledChannels: source.enabledChannels,
    completionMessage: source.completionMessage,
    tooltipEnabled: source.tooltipEnabled,
    tooltipMessage: source.tooltipMessage,
    tooltipDelay: source.tooltipDelay,
    tooltipDuration: source.tooltipDuration,
    nodes: source.nodes,
    connections: source.connections,
  });

  return NextResponse.json({ ok: true, id: copy._id.toString() }, { status: 201 });
}
