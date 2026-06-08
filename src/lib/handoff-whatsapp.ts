/**
 * Alerta de handoff al dueño vía WhatsApp Cloud API (Flujo B: formulario).
 */

import { connectDB } from '@/lib/db/connection';
import { ClientAgent, ConversationSession } from '@/lib/db/models';
import { resolveHandoffOwnerNotifyPhone } from '@/lib/handoff-notify';
import { sendHandoffNotification, type WhatsAppAgentConfig } from '@/lib/whatsapp';

export type HandoffWaNotifyResult = {
  attempted: boolean;
  ok?: boolean;
  skippedReason?: 'no_session' | 'no_phone' | 'no_whatsapp_agent' | 'send_failed';
  error?: string;
  messageId?: string;
};

const WA_AGENT_FILTER = {
  'whatsapp.enabled': true,
  'whatsapp.accessTokenEnc': { $exists: true, $ne: '' },
} as const;

async function findWhatsAppAgentForHandoff(
  userId: string,
  preferredAgentId?: string,
): Promise<{ whatsapp?: WhatsAppAgentConfig } | null> {
  const uid = String(userId).trim();
  const agentId = typeof preferredAgentId === 'string' ? preferredAgentId.trim() : '';
  if (agentId) {
    const preferred = await ClientAgent.findOne({ _id: agentId, userId: uid, ...WA_AGENT_FILTER })
      .select({ whatsapp: 1 })
      .lean() as { whatsapp?: WhatsAppAgentConfig } | null;
    if (preferred?.whatsapp) return preferred;
  }
  return ClientAgent.findOne({ userId: uid, ...WA_AGENT_FILTER })
    .select({ whatsapp: 1 })
    .lean() as Promise<{ whatsapp?: WhatsAppAgentConfig } | null>;
}

export async function notifyOwnerHandoffViaWhatsApp(params: {
  userId: string;
  widgetId: string;
  widgetName: string;
  widget: { humanSupportPhone?: unknown };
  user?: { escalationWhatsAppPhone?: unknown } | null;
  chatSessionId?: string;
  handoffSessionId?: string | null;
  preferredAgentId?: string;
  visitorName?: string;
  userMessage?: string;
}): Promise<HandoffWaNotifyResult> {
  const chatSessionId = params.chatSessionId?.trim() || '';
  if (!chatSessionId) {
    return { attempted: false, skippedReason: 'no_session' };
  }

  const notifyPhone = resolveHandoffOwnerNotifyPhone(params.widget, params.user);
  if (!notifyPhone) {
    return { attempted: false, skippedReason: 'no_phone' };
  }

  await connectDB();

  const waAgent = await findWhatsAppAgentForHandoff(params.userId, params.preferredAgentId);
  if (!waAgent?.whatsapp) {
    console.warn('[handoff] WA notification skipped: no agent with WhatsApp connected', {
      widgetId: params.widgetId,
      userId: params.userId,
      preferredAgentId: params.preferredAgentId || null,
    });
    return { attempted: true, ok: false, skippedReason: 'no_whatsapp_agent' };
  }

  const notifResult = await sendHandoffNotification({
    waConfig: waAgent.whatsapp,
    ownerPhone: notifyPhone,
    visitorName: params.visitorName,
    userMessage: params.userMessage,
    widgetName: params.widgetName,
    sessionId: chatSessionId,
  });

  if (!notifResult.ok) {
    console.error('[handoff] WA notification send failed:', notifResult.error, {
      widgetId: params.widgetId,
      notifyPhone,
    });
    return {
      attempted: true,
      ok: false,
      skippedReason: 'send_failed',
      error: notifResult.error,
    };
  }

  if (notifResult.messageId && params.handoffSessionId) {
    await ConversationSession.updateOne(
      { sessionId: params.handoffSessionId },
      { $set: { handoffWaNotifMsgId: notifResult.messageId } },
    ).catch(() => {});
  }

  return { attempted: true, ok: true, messageId: notifResult.messageId };
}
