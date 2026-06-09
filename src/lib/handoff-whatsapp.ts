/**
 * Alerta de handoff al dueño vía WhatsApp Cloud API (Flujo B: formulario).
 */

import { connectDB } from '@/lib/db/connection';
import { ClientAgent, ConversationSession } from '@/lib/db/models';
import { isWhatsAppServiceWindowOpen } from '@/lib/inbox-handoff';
import { resolveHandoffOwnerNotifyPhone } from '@/lib/handoff-notify';
import { sendHandoffNotification, getWhatsAppAccessToken, type WhatsAppAgentConfig } from '@/lib/whatsapp';

export type HandoffWaNotifyResult = {
  attempted: boolean;
  ok?: boolean;
  skippedReason?: 'no_session' | 'no_phone' | 'no_whatsapp_agent' | 'send_failed' | 'window_closed';
  error?: string;
  messageId?: string;
  notifyPhone?: string;
  method?: 'template' | 'text';
  serviceWindowOpen?: boolean;
  fromDisplayPhone?: string | null;
  fromPhoneNumberId?: string | null;
  deliveryWarning?: string;
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
  user?: { escalationWhatsAppPhone?: unknown; ownerWaLastInboundAt?: Date | null } | null;
  chatSessionId?: string;
  handoffSessionId?: string | null;
  preferredAgentId?: string;
  visitorName?: string;
  userMessage?: string;
}): Promise<HandoffWaNotifyResult> {
  const chatSessionId = params.chatSessionId?.trim() || '';
  if (!chatSessionId) {
    console.log('[AFHUB-DEBUG] handoff WA skipped: no sessionId', {
      widgetId: params.widgetId,
      userId: params.userId,
    });
    return { attempted: false, skippedReason: 'no_session' };
  }

  const notifyPhone = resolveHandoffOwnerNotifyPhone(params.widget, params.user);
  if (!notifyPhone) {
    console.log('[AFHUB-DEBUG] handoff WA skipped: no notify phone', {
      widgetId: params.widgetId,
      userId: params.userId,
    });
    return { attempted: false, skippedReason: 'no_phone' };
  }

  await connectDB();

  console.log('[AFHUB-DEBUG] handoff WA notify starting:', {
    widgetId: params.widgetId,
    widgetName: params.widgetName,
    userId: params.userId,
    chatSessionId,
    handoffSessionId: params.handoffSessionId || null,
    preferredAgentId: params.preferredAgentId || null,
    notifyPhone,
  });

  const waAgent = await findWhatsAppAgentForHandoff(params.userId, params.preferredAgentId);
  if (!waAgent?.whatsapp) {
    console.log('[AFHUB-DEBUG] ❌ handoff WA skipped: no WhatsApp agent connected', {
      widgetId: params.widgetId,
      userId: params.userId,
      preferredAgentId: params.preferredAgentId || null,
    });
    return { attempted: true, ok: false, skippedReason: 'no_whatsapp_agent' };
  }

  console.log('[AFHUB-DEBUG] handoff WA agent resolved:', {
    phoneNumberId: waAgent.whatsapp.phoneNumberId || null,
    displayPhone: waAgent.whatsapp.displayPhone || null,
    status: waAgent.whatsapp.status || null,
    hasAccessTokenEnc: Boolean(waAgent.whatsapp.accessTokenEnc),
    tokenDecryptOk: Boolean(getWhatsAppAccessToken(waAgent.whatsapp)),
    hasSecretEncryptionKey: Boolean(process.env.SECRET_ENCRYPTION_KEY?.trim()),
  });

  const ownerWaLastInboundAt =
    params.user?.ownerWaLastInboundAt instanceof Date ? params.user.ownerWaLastInboundAt : null;

  const notifResult = await sendHandoffNotification({
    waConfig: waAgent.whatsapp,
    ownerPhone: notifyPhone,
    visitorName: params.visitorName,
    userMessage: params.userMessage,
    widgetName: params.widgetName,
    sessionId: chatSessionId,
    ownerWaLastInboundAt,
  });

  if (!notifResult.ok) {
    const windowClosed =
      notifResult.serviceWindowOpen === false
      && typeof notifResult.error === 'string'
      && notifResult.error.includes('Ventana WhatsApp cerrada');
    console.log('[AFHUB-DEBUG] ❌ handoff WA send failed:', {
      widgetId: params.widgetId,
      notifyPhone,
      error: notifResult.error,
      method: notifResult.method,
      serviceWindowOpen: notifResult.serviceWindowOpen,
      windowClosed,
    });
    return {
      attempted: true,
      ok: false,
      skippedReason: windowClosed ? 'window_closed' : 'send_failed',
      error: notifResult.error,
      notifyPhone,
      serviceWindowOpen: notifResult.serviceWindowOpen,
      fromDisplayPhone: waAgent.whatsapp.displayPhone || null,
      fromPhoneNumberId: waAgent.whatsapp.phoneNumberId || null,
    };
  }

  if (notifResult.messageId && params.handoffSessionId) {
    await ConversationSession.updateOne(
      { sessionId: params.handoffSessionId },
      { $set: { handoffWaNotifMsgId: notifResult.messageId } },
    ).catch(() => {});
  }

  const serviceWindowOpen =
    notifResult.serviceWindowOpen ?? isWhatsAppServiceWindowOpen(ownerWaLastInboundAt);

  console.log('[AFHUB-DEBUG] ✅ handoff WA sent to Meta:', {
    widgetId: params.widgetId,
    notifyPhone: notifResult.notifyPhone || notifyPhone,
    messageId: notifResult.messageId,
    method: notifResult.method,
    serviceWindowOpen,
    handoffSessionId: params.handoffSessionId || null,
  });

  return {
    attempted: true,
    ok: true,
    messageId: notifResult.messageId,
    notifyPhone: notifResult.notifyPhone || notifyPhone,
    method: notifResult.method,
    serviceWindowOpen,
    fromDisplayPhone: waAgent.whatsapp.displayPhone || null,
    fromPhoneNumberId: waAgent.whatsapp.phoneNumberId || null,
    deliveryWarning: serviceWindowOpen
      ? undefined
      : 'Meta puede rechazar la entrega (Re-engagement): el dueño debe escribir primero al número Business del agente, o usar plantilla aprobada.',
  };
}
