import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationFlow, FlowConversation, Widget } from '@/lib/db/models';
import { buildFlowEmbedSnippet, countFlowSteps } from '@/lib/flow-admin';
import { flowAccessDeniedMessage, resolveFlowAccessFromRequest } from '@/lib/flow-access';
import { aggregateFlowStats, listRecentFlowConversations } from '@/lib/flow-stats';
import type { FlowConnection, FlowNode, FlowSettings } from '@/lib/flow-editor/types';

function toFlowResponse(doc: {
  _id: unknown;
  userId: string;
  workspaceId: string;
  orgId?: string | null;
  name: string;
  status: string;
  description?: string;
  tags?: string;
  embedToken?: string | null;
  generatesLeads?: boolean;
  enabledChannels?: string[];
  completionMessage?: string;
  tooltipEnabled?: boolean;
  tooltipMessage?: string;
  tooltipDelay?: number;
  tooltipDuration?: number;
  nodes?: FlowNode[];
  connections?: FlowConnection[];
  createdAt: Date;
  updatedAt: Date;
}, stats?: Awaited<ReturnType<typeof aggregateFlowStats>>) {
  const settings: FlowSettings = {
    description: doc.description ?? '',
    tags: doc.tags ?? '',
    generatesLeads: doc.generatesLeads ?? false,
    enabledChannels: doc.enabledChannels ?? ['widget'],
    completionMessage: doc.completionMessage ?? '',
    tooltipEnabled: doc.tooltipEnabled ?? false,
    tooltipMessage: doc.tooltipMessage ?? '',
    tooltipDelay: doc.tooltipDelay ?? 3000,
    tooltipDuration: doc.tooltipDuration ?? 5000,
  };

  return {
    id: String(doc._id),
    userId: doc.userId,
    workspaceId: doc.workspaceId,
    orgId: doc.orgId ?? null,
    name: doc.name,
    description: doc.description ?? '',
    tags: doc.tags ?? '',
    embedToken: doc.embedToken ?? null,
    status: doc.status as 'draft' | 'published',
    settings,
    nodes: doc.nodes ?? [],
    connections: doc.connections ?? [],
    stepCount: countFlowSteps(doc.nodes ?? []),
    stats: stats ?? {
      totalConversations: 0,
      completed: 0,
      abandoned: 0,
      completionRate: 0,
      avgDurationSec: 0,
      totalMessages: 0,
      avgMessagesPerConversation: 0,
    },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const access = await resolveFlowAccessFromRequest(req);
  if (!access) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!access.hasAccess) {
    return NextResponse.json({ error: flowAccessDeniedMessage(), code: 'FLOW_PLAN_REQUIRED' }, { status: 403 });
  }

  const { userId } = access;

  const { id } = await ctx.params;
  await connectDB();

  const doc = await ConversationFlow.findOne({ _id: id, userId });
  if (!doc) return NextResponse.json({ error: 'Flujo no encontrado.' }, { status: 404 });

  if (!doc.embedToken) {
    const { randomBytes } = await import('crypto');
    doc.embedToken = `ft_${randomBytes(20).toString('hex')}`;
    await doc.save();
  }

  const widget = await Widget.findOne({ userId }).sort({ updatedAt: -1 }).select({ afhubToken: 1 }).lean() as
    | { afhubToken?: string | null } | null;

  const origin = req.nextUrl.origin;
  const [stats, recentConversations] = await Promise.all([
    aggregateFlowStats(id, userId),
    listRecentFlowConversations(id, userId, 10),
  ]);
  const flow = toFlowResponse(doc.toObject() as Parameters<typeof toFlowResponse>[0], stats);
  const embedSnippet = flow.embedToken
    ? buildFlowEmbedSnippet({
      origin,
      flowId: flow.id,
      embedToken: flow.embedToken,
      widgetToken: widget?.afhubToken ?? null,
    })
    : null;

  return NextResponse.json({ flow, embedSnippet, recentConversations });
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const access = await resolveFlowAccessFromRequest(req);
  if (!access) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!access.hasAccess) {
    return NextResponse.json({ error: flowAccessDeniedMessage(), code: 'FLOW_PLAN_REQUIRED' }, { status: 403 });
  }

  const { userId } = access;

  const { id } = await ctx.params;
  const body = await req.json() as {
    name?: string;
    description?: string;
    tags?: string;
    status?: 'draft' | 'published';
    settings?: Partial<FlowSettings>;
    nodes?: FlowNode[];
    connections?: FlowConnection[];
  };

  await connectDB();
  const doc = await ConversationFlow.findOne({ _id: id, userId });
  if (!doc) return NextResponse.json({ error: 'Flujo no encontrado.' }, { status: 404 });

  if (typeof body.name === 'string') doc.name = body.name.trim() || doc.name;
  if (typeof body.description === 'string') doc.description = body.description;
  if (typeof body.tags === 'string') doc.tags = body.tags;
  if (body.status) doc.status = body.status;
  if (body.nodes) doc.nodes = body.nodes;
  if (body.connections) doc.connections = body.connections;

  if (!doc.embedToken) {
    const { randomBytes } = await import('crypto');
    doc.embedToken = `ft_${randomBytes(20).toString('hex')}`;
  }

  if (body.settings) {
    const s = body.settings;
    if (s.description !== undefined) doc.description = s.description;
    if (s.tags !== undefined) doc.tags = s.tags;
    if (s.generatesLeads !== undefined) doc.generatesLeads = s.generatesLeads;
    if (s.enabledChannels !== undefined) doc.enabledChannels = s.enabledChannels;
    if (s.completionMessage !== undefined) doc.completionMessage = s.completionMessage;
    if (s.tooltipEnabled !== undefined) doc.tooltipEnabled = s.tooltipEnabled;
    if (s.tooltipMessage !== undefined) doc.tooltipMessage = s.tooltipMessage;
    if (s.tooltipDelay !== undefined) doc.tooltipDelay = s.tooltipDelay;
    if (s.tooltipDuration !== undefined) doc.tooltipDuration = s.tooltipDuration;
  }

  await doc.save();
  const stats = await aggregateFlowStats(id, userId);
  return NextResponse.json({ ok: true, flow: toFlowResponse(doc.toObject(), stats) });
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const access = await resolveFlowAccessFromRequest(req);
  if (!access) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!access.hasAccess) {
    return NextResponse.json({ error: flowAccessDeniedMessage(), code: 'FLOW_PLAN_REQUIRED' }, { status: 403 });
  }

  const { userId } = access;

  const { id } = await ctx.params;
  await connectDB();

  const result = await ConversationFlow.deleteOne({ _id: id, userId });
  if (!result.deletedCount) {
    return NextResponse.json({ error: 'Flujo no encontrado.' }, { status: 404 });
  }

  await FlowConversation.deleteMany({ flowId: id, userId });

  return NextResponse.json({ ok: true });
}
