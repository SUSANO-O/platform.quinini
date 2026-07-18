import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationFlow } from '@/lib/db/models';
import { upsertFlowConversation } from '@/lib/flow-stats';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';
import { flowAccessDeniedMessage, resolveFlowAccessForUser } from '@/lib/flow-access';

type RouteCtx = { params: Promise<{ id: string }> };

type Body = {
  flowToken?: string;
  sessionId?: string;
  widgetId?: string;
  visitorId?: string;
  status?: 'active' | 'completed' | 'abandoned';
  messageCount?: number;
  currentNodeId?: string;
  answers?: unknown[];
};

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  let body: Body;
  try {
    body = await req.json() as Body;
  } catch {
    return withCors(req, NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }));
  }

  const flowToken = body.flowToken?.trim()
    || req.headers.get('x-flow-token')?.trim()
    || '';

  if (!flowToken) {
    return withCors(req, NextResponse.json({ error: 'Token de flujo requerido.' }, { status: 401 }));
  }

  await connectDB();
  const flow = await ConversationFlow.findOne({ _id: id, embedToken: flowToken }).lean();
  if (!flow) {
    return withCors(req, NextResponse.json({ error: 'Flujo no encontrado o token inválido.' }, { status: 404 }));
  }

  if (flow.status !== 'published') {
    return withCors(req, NextResponse.json({ error: 'El flujo no está publicado.' }, { status: 403 }));
  }

  const ownerAccess = await resolveFlowAccessForUser(flow.userId);
  if (!ownerAccess.hasAccess) {
    return withCors(req, NextResponse.json({ error: flowAccessDeniedMessage(), code: 'FLOW_PLAN_REQUIRED' }, { status: 403 }));
  }

  const sessionId = body.sessionId?.trim() || `fc_${randomUUID()}`;
  const status = body.status ?? 'active';

  await upsertFlowConversation({
    flowId: id,
    userId: flow.userId,
    sessionId,
    widgetId: body.widgetId,
    visitorId: body.visitorId,
    status,
    messageCount: body.messageCount,
    currentNodeId: body.currentNodeId,
    answers: body.answers,
  });

  return withCors(
    req,
    NextResponse.json({ ok: true, sessionId }, { status: body.sessionId ? 200 : 201 }),
  );
}
