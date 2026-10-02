import { randomUUID } from 'crypto';
import { NextRequest, NextResponse, after } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationFlow } from '@/lib/db/models';
import { captureFlowLeadOnce, upsertFlowConversation } from '@/lib/flow-stats';
import { extractFlowLead, sanitizeFlowAnswers, sanitizeFlowSource } from '@/lib/flow-leads';
import { sendSaasWebhook } from '@/lib/saas-webhook-outbound';
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
  /** URL donde corre el flujo: solo se guarda la ruta y utm_*. */
  pageUrl?: string;
  /** Widget al que el flujo pasó la conversación (nodo agent_handoff). */
  handedOffTo?: string;
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

  const sessionId = (typeof body.sessionId === 'string' ? body.sessionId.trim().slice(0, 120) : '') || `fc_${randomUUID()}`;
  const status = body.status === 'completed' || body.status === 'abandoned' ? body.status : 'active';
  const answers = body.answers !== undefined ? sanitizeFlowAnswers(body.answers) : undefined;
  const source = sanitizeFlowSource(body.pageUrl);
  const handedOffTo = typeof body.handedOffTo === 'string' && /^[a-f0-9]{24}$/i.test(body.handedOffTo) ? body.handedOffTo : undefined;

  await upsertFlowConversation({
    flowId: id,
    userId: flow.userId,
    sessionId,
    widgetId: body.widgetId,
    visitorId: body.visitorId,
    status,
    messageCount: body.messageCount,
    currentNodeId: body.currentNodeId,
    answers,
    ...(source ? { source } : {}),
    ...(handedOffTo ? { handedOffTo } : {}),
  });

  // Lead: al completar (o al pasar al agente) un flujo con "genera leads". Una sola vez por sesión.
  const finished = status === 'completed' || Boolean(handedOffTo);
  if (finished && flow.generatesLeads && answers?.length) {
    const lead = extractFlowLead((flow.nodes ?? []) as Array<Record<string, unknown>>, answers);
    if (lead && (await captureFlowLeadOnce({ flowId: id, sessionId, lead }))) {
      const send = () =>
        sendSaasWebhook(flow.userId, 'flow.lead_captured', {
          flowId: id,
          flowName: flow.name ?? '',
          sessionId,
          lead,
          source,
          capturedAt: new Date().toISOString(),
        });
      try {
        after(send);
      } catch {
        void send();
      }
    }
  }

  return withCors(
    req,
    NextResponse.json({ ok: true, sessionId }, { status: body.sessionId ? 200 : 201 }),
  );
}
