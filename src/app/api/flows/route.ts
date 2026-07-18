import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationFlow } from '@/lib/db/models';
import { countFlowSteps, flowLimitForPlan, SUPPORT_TICKET_META } from '@/lib/flow-admin';
import { flowAccessDeniedMessage, resolveFlowAccessFromRequest } from '@/lib/flow-access';
import { createStartNode, DEFAULT_FLOW_SETTINGS } from '@/lib/flow-editor/constants';
import type { FlowConnection, FlowNode } from '@/lib/flow-editor/types';

function personalWorkspaceId(userId: string) {
  return `personal:${userId}`;
}

export async function GET(req: NextRequest) {
  const access = await resolveFlowAccessFromRequest(req);
  if (!access) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!access.hasAccess) {
    return NextResponse.json({ error: flowAccessDeniedMessage(), code: 'FLOW_PLAN_REQUIRED' }, { status: 403 });
  }

  const { userId } = access;
  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
    || personalWorkspaceId(userId);

  if (workspaceId.startsWith('personal:') && workspaceId !== personalWorkspaceId(userId)) {
    return NextResponse.json({ error: 'Sin acceso a este workspace.' }, { status: 403 });
  }

  await connectDB();
  const limit = flowLimitForPlan(access.plan, access.status, access.features);

  const flows = await ConversationFlow.find({ userId, workspaceId })
    .sort({ updatedAt: -1 })
    .select({ name: 1, description: 1, tags: 1, status: 1, nodes: 1, createdAt: 1, updatedAt: 1 })
    .lean();

  return NextResponse.json({
    limit,
    used: flows.length,
    flows: flows.map((f) => ({
      id: String(f._id),
      name: f.name,
      description: f.description ?? '',
      tags: f.tags ?? '',
      status: f.status,
      stepCount: countFlowSteps((f.nodes ?? []) as FlowNode[]),
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const access = await resolveFlowAccessFromRequest(req);
  if (!access) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!access.hasAccess) {
    return NextResponse.json({ error: flowAccessDeniedMessage(), code: 'FLOW_PLAN_REQUIRED' }, { status: 403 });
  }

  const { userId } = access;

  const body = await req.json() as {
    name?: string;
    workspaceId?: string;
    template?: 'support-ticket' | 'blank';
    nodes?: FlowNode[];
    connections?: FlowConnection[];
  };

  const workspaceId = body.workspaceId || personalWorkspaceId(userId);
  if (workspaceId.startsWith('personal:') && workspaceId !== personalWorkspaceId(userId)) {
    return NextResponse.json({ error: 'Sin acceso a este workspace.' }, { status: 403 });
  }

  await connectDB();

  const limit = flowLimitForPlan(access.plan, access.status, access.features);
  if (limit === 0) {
    return NextResponse.json({ error: flowAccessDeniedMessage(), code: 'FLOW_PLAN_REQUIRED' }, { status: 403 });
  }
  if (limit > 0) {
    const used = await ConversationFlow.countDocuments({ userId, workspaceId });
    if (used >= limit) {
      return NextResponse.json({
        error: `Límite de flujos alcanzado (${used}/${limit}).`,
        code: 'FLOW_LIMIT',
      }, { status: 403 });
    }
  }

  let nodes: FlowNode[] = [createStartNode()];
  let connections: FlowConnection[] = [];
  let name = body.name?.trim() || 'Flujo sin título';
  let description = DEFAULT_FLOW_SETTINGS.description;
  let tags = DEFAULT_FLOW_SETTINGS.tags;

  if (body.template === 'support-ticket') {
    const { supportTicketTemplate } = await import('@/lib/flow-editor/constants');
    const tpl = supportTicketTemplate();
    nodes = tpl.nodes;
    connections = tpl.connections;
    name = SUPPORT_TICKET_META.name;
    description = SUPPORT_TICKET_META.description;
    tags = SUPPORT_TICKET_META.tags;
  } else if (body.nodes?.length) {
    nodes = body.nodes;
    connections = body.connections ?? [];
  }

  const embedToken = `ft_${randomBytes(20).toString('hex')}`;

  const doc = await ConversationFlow.create({
    userId,
    workspaceId,
    orgId: workspaceId.startsWith('org:') ? workspaceId.slice(4) : null,
    name,
    status: 'draft',
    description,
    tags,
    embedToken,
    generatesLeads: DEFAULT_FLOW_SETTINGS.generatesLeads,
    enabledChannels: DEFAULT_FLOW_SETTINGS.enabledChannels,
    completionMessage: DEFAULT_FLOW_SETTINGS.completionMessage,
    tooltipEnabled: DEFAULT_FLOW_SETTINGS.tooltipEnabled,
    tooltipMessage: DEFAULT_FLOW_SETTINGS.tooltipMessage,
    tooltipDelay: DEFAULT_FLOW_SETTINGS.tooltipDelay,
    tooltipDuration: DEFAULT_FLOW_SETTINGS.tooltipDuration,
    nodes,
    connections,
  });

  return NextResponse.json({ ok: true, id: doc._id.toString() }, { status: 201 });
}
