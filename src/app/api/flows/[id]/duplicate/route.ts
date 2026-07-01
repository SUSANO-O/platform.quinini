import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ConversationFlow } from '@/lib/db/models';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await ctx.params;
  await connectDB();

  const source = await ConversationFlow.findOne({ _id: id, userId }).lean();
  if (!source) return NextResponse.json({ error: 'Flujo no encontrado.' }, { status: 404 });

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
