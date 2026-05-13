/**
 * POST /api/widgets/[id]/handoff
 *
 * Registra una solicitud de escalación a agente humano desde el widget.
 * Envía notificación al dueño del widget (email + webhook saliente).
 *
 * Body: { sessionId?, userMessage?, contactInfo?: { name?, phone?, email? } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget, User, ConversationSession } from '@/lib/db/models';
import { dispatchSaasWebhook } from '@/lib/saas-webhook-outbound';
import { sendPushToUser } from '@/lib/push-notifications';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json() as {
    sessionId?: string;
    userMessage?: string;
    contactInfo?: { name?: string; phone?: string; email?: string };
    agentId?: string;
  };

  await connectDB();

  const widget = await Widget.findById(id)
    .select({ userId: 1, name: 1, humanSupportPhone: 1 })
    .lean() as { userId?: string; name?: string; humanSupportPhone?: string } | null;

  if (!widget?.userId) {
    return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });
  }

  const uid = widget.userId;

  // Mark session as escalated
  if (body.sessionId) {
    await ConversationSession.updateOne(
      { sessionId: body.sessionId, userId: uid },
      { $set: { escalated: true } },
    ).catch(() => {});
  }

  // Get user for push notification
  const user = await User.findById(uid)
    .select({ email: 1, pushSubscription: 1 })
    .lean() as { email?: string; pushSubscription?: unknown } | null;

  const notifTitle = `Nueva solicitud de atención humana`;
  const notifBody = `Widget "${widget.name || id}"${body.contactInfo?.name ? ` — ${body.contactInfo.name}` : ''}${body.userMessage ? `: "${body.userMessage.slice(0, 60)}"` : ''}`;

  // Send push notification
  if (user?.pushSubscription) {
    void sendPushToUser(user.pushSubscription, {
      title: notifTitle,
      body: notifBody,
      url: '/dashboard/widgets',
      tag: `handoff-${id}`,
    }).catch(() => {});
  }

  // Dispatch outbound webhook
  dispatchSaasWebhook(uid, 'conversation.escalation', {
    widgetId: id,
    widgetName: widget.name || id,
    agentId: body.agentId || '',
    sessionId: body.sessionId || '',
    userMessage: body.userMessage || '',
    contactInfo: body.contactInfo || {},
    humanSupportPhone: widget.humanSupportPhone || '',
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    humanSupportPhone: widget.humanSupportPhone || null,
    message: 'Solicitud de atención humana registrada.',
  });
}

// CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
