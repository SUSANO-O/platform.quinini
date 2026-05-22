/**
 * POST /api/widgets/[id]/handoff
 *
 * Registra una solicitud de escalación a agente humano desde el widget.
 * Envía notificación al dueño del widget (push + webhook saliente + ticket opcional).
 *
 * Body: { sessionId?, userMessage?, contactInfo?, agentId?, token? }
 * Header opcional: X-Widget-Token (wt_*)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget, User, ConversationSession } from '@/lib/db/models';
import { dispatchSaasWebhook } from '@/lib/saas-webhook-outbound';
import { sendPushToUser } from '@/lib/push-notifications';
import { createEscalationTicket } from '@/lib/escalation-tickets';
import { notifySlackOnEscalation } from '@/lib/escalation-slack';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    sessionId?: string;
    userMessage?: string;
    contactInfo?: { name?: string; phone?: string; email?: string };
    agentId?: string;
    token?: string;
  };

  await connectDB();

  const widget = await Widget.findById(id)
    .select({ userId: 1, name: 1, humanSupportPhone: 1, afhubToken: 1, active: 1 })
    .lean() as {
      userId?: string;
      name?: string;
      humanSupportPhone?: string;
      afhubToken?: string;
      active?: boolean;
    } | null;

  if (!widget?.userId) {
    return withCors(req, NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 }));
  }

  if (widget.active === false) {
    return withCors(req, NextResponse.json({ error: 'Widget desactivado.' }, { status: 403 }));
  }

  const wtToken =
    req.headers.get('x-widget-token')?.trim() ||
    (typeof body.token === 'string' ? body.token.trim() : '');
  if (!wtToken || !wtToken.startsWith('wt_') || wtToken !== widget.afhubToken) {
    return withCors(req, NextResponse.json({ error: 'Token de widget inválido.' }, { status: 403 }));
  }

  const uid = widget.userId;
  const now = new Date();
  const contactInfo = {
    name: body.contactInfo?.name?.trim() || '',
    email: body.contactInfo?.email?.trim() || '',
    phone: body.contactInfo?.phone?.trim() || '',
  };

  if (body.sessionId) {
    await ConversationSession.findOneAndUpdate(
      { sessionId: body.sessionId, userId: uid },
      {
        $set: {
          escalated: true,
          inboxStatus: 'open',
          handoffContact: contactInfo,
          handoffMessage: body.userMessage?.trim() || '',
          handoffAt: now,
          widgetId: id,
          agentId: body.agentId || '',
        },
        $setOnInsert: {
          sessionId: body.sessionId,
          userId: uid,
          widgetId: id,
          agentId: body.agentId || '',
          startedAt: now,
          messageCount: 0,
        },
      },
      { upsert: true },
    ).catch(() => {});
  }

  const user = await User.findById(uid)
    .select({ email: 1, pushSubscription: 1 })
    .lean() as { email?: string; pushSubscription?: unknown } | null;

  const notifTitle = 'Nueva solicitud de atención humana';
  const notifBody = `Widget "${widget.name || id}"${contactInfo.name ? ` — ${contactInfo.name}` : ''}${body.userMessage ? `: "${body.userMessage.slice(0, 60)}"` : ''}`;

  if (user?.pushSubscription) {
    void sendPushToUser(user.pushSubscription, {
      title: notifTitle,
      body: notifBody,
      url: '/dashboard/inbox',
      tag: `handoff-${id}`,
    }).catch(() => {});
  }

  const webhookPayload = {
    widgetId: id,
    widgetName: widget.name || id,
    agentId: body.agentId || '',
    sessionId: body.sessionId || '',
    userMessage: body.userMessage || '',
    contactInfo,
    humanSupportPhone: widget.humanSupportPhone || '',
    timestamp: now.toISOString(),
  };

  dispatchSaasWebhook(uid, 'conversation.escalation', webhookPayload);

  const inboxUrl =
    req.headers.get('x-forwarded-host')
      ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}/dashboard/inbox`
      : `${req.nextUrl.origin.replace(/\/$/, '')}/dashboard/inbox`;

  const slackResult = await notifySlackOnEscalation(
    {
      userId: uid,
      widgetId: id,
      widgetName: widget.name || id,
      sessionId: body.sessionId || '',
      agentId: body.agentId,
      userMessage: body.userMessage,
      contactInfo,
      humanSupportPhone: widget.humanSupportPhone,
    },
    inboxUrl,
  );

  const ticketResult = await createEscalationTicket({
    userId: uid,
    widgetId: id,
    widgetName: widget.name || id,
    sessionId: body.sessionId || '',
    agentId: body.agentId,
    userMessage: body.userMessage,
    contactInfo,
    humanSupportPhone: widget.humanSupportPhone,
  });

  return withCors(
    req,
    NextResponse.json({
      ok: true,
      humanSupportPhone: widget.humanSupportPhone || null,
      message: 'Solicitud de atención humana registrada. Te contactaremos pronto.',
      ticket: ticketResult.attempted
        ? {
            provider: ticketResult.provider,
            ticketId: ticketResult.ticketId,
            ticketUrl: ticketResult.ticketUrl,
            error: ticketResult.error,
          }
        : null,
      slack: slackResult.attempted
        ? { ok: slackResult.ok === true, error: slackResult.error }
        : null,
    }),
  );
}
