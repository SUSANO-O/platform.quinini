/**
 * Destinos de notificación al pulsar «Hablar con una persona» en el widget.
 * El Inbox interno siempre recibe la escalación; esto controla canales externos.
 */

import { connectDB } from '@/lib/db/connection';
import { ClientAgent, ConversationSession } from '@/lib/db/models';
import { sendHandoffNotification, type WhatsAppAgentConfig } from '@/lib/whatsapp';

export type HandoffNotifyMode = 'inbox' | 'webhook' | 'slack' | 'both';

const MODES: HandoffNotifyMode[] = ['inbox', 'webhook', 'slack', 'both'];

export function normalizeHandoffNotifyMode(value: unknown): HandoffNotifyMode {
  if (typeof value === 'string' && (MODES as string[]).includes(value)) {
    return value as HandoffNotifyMode;
  }
  return 'both';
}

export function shouldDispatchHandoffWebhook(mode: HandoffNotifyMode): boolean {
  return mode === 'webhook' || mode === 'both';
}

export function shouldDispatchHandoffSlack(mode: HandoffNotifyMode): boolean {
  return mode === 'slack' || mode === 'both';
}

export const HANDOFF_NOTIFY_MODE_LABELS: Record<HandoffNotifyMode, string> = {
  inbox: 'Solo Inbox (panel BotIvA)',
  webhook: 'Webhook saliente',
  slack: 'Slack',
  both: 'Webhook + Slack',
};

/** Número público del widget (enlace wa.me al visitante). Widget primero, fallback al dueño. */
export function resolveWidgetHumanSupportPhone(
  widget: { humanSupportPhone?: unknown },
  user?: { escalationWhatsAppPhone?: unknown } | null,
): string {
  const widgetPhone =
    typeof widget.humanSupportPhone === 'string' ? widget.humanSupportPhone.trim() : '';
  if (widgetPhone) return widgetPhone.slice(0, 48);
  const userPhone =
    typeof user?.escalationWhatsAppPhone === 'string' ? user.escalationWhatsAppPhone.trim() : '';
  return userPhone ? userPhone.slice(0, 48) : '';
}

/** Número personal del dueño para alertas de handoff (Flujo B: formulario). Ajustes primero. */
export function resolveHandoffOwnerNotifyPhone(
  widget: { humanSupportPhone?: unknown },
  user?: { escalationWhatsAppPhone?: unknown } | null,
): string {
  const ownerPhone =
    typeof user?.escalationWhatsAppPhone === 'string' ? user.escalationWhatsAppPhone.trim() : '';
  if (ownerPhone) return ownerPhone.slice(0, 48);
  const widgetPhone =
    typeof widget.humanSupportPhone === 'string' ? widget.humanSupportPhone.trim() : '';
  return widgetPhone ? widgetPhone.slice(0, 48) : '';
}

/** Normaliza campos de soporte humano / escalación en respuestas API del widget. */
export function normalizeWidgetSupportFields<T extends Record<string, unknown>>(
  widget: T,
  user?: { escalationWhatsAppPhone?: unknown } | null,
) {
  const humanSupportPhone = resolveWidgetHumanSupportPhone(widget, user);
  return {
    ...widget,
    humanSupportPhone,
    handoffNotifyMode: normalizeHandoffNotifyMode(widget.handoffNotifyMode),
    handoffEnabled: widget.handoffEnabled !== false,
    humanSupportEnabled: widget.humanSupportEnabled !== false,
    fabDismissible: widget.fabDismissible !== false,
  };
}

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

/** Alerta al dueño por WhatsApp Cloud API (Flujo B: formulario de handoff). */
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
