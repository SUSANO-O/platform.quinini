/**
 * Handoff Inbox: cierra solicitudes anteriores y crea una sesión ho_* nueva por escalación.
 */
import { randomUUID } from 'crypto';
import { ConversationSession } from '@/lib/db/models';

export type HandoffSessionInput = {
  sessionId: string;
  userId: string;
  widgetId: string;
  agentId?: string;
  visitorId?: string;
  contactInfo: { name: string; email: string; phone: string };
  userMessage?: string;
  handoffAt?: Date;
};

const MS_24H = 24 * 60 * 60 * 1000;

/** Cierra handoffs abiertos previos del mismo chat para empezar conversación limpia. */
export async function closePreviousHandoffSessions(input: {
  chatSessionId: string;
  userId: string;
  widgetId: string;
  closedAt?: Date;
}): Promise<number> {
  const chatSessionId = input.chatSessionId.trim();
  const userId = String(input.userId).trim();
  const widgetId = String(input.widgetId).trim();
  if (!chatSessionId || !userId || !widgetId) return 0;

  const closedAt = input.closedAt ?? new Date();
  const result = await ConversationSession.updateMany(
    {
      userId,
      widgetId,
      chatSessionId,
      escalated: true,
      inboxStatus: { $ne: 'resolved' },
      handoffAt: { $exists: true, $ne: null },
    },
    {
      $set: {
        inboxStatus: 'resolved',
        humanMode: false,
        endedAt: closedAt,
      },
      $unset: {
        handoffWaNotifMsgId: 1,
        handoffWaDeliveryError: 1,
      },
    },
  );
  return result.modifiedCount ?? 0;
}

/**
 * Cierra handoffs viejos del mismo chat y crea una entrada Inbox nueva (ho_*).
 */
export async function prepareHandoffInboxSession(input: HandoffSessionInput): Promise<string | null> {
  const chatSessionId = input.sessionId.trim();
  const userId = String(input.userId).trim();
  if (!chatSessionId || !userId) return null;

  const now = input.handoffAt ?? new Date();
  await closePreviousHandoffSessions({
    chatSessionId,
    userId,
    widgetId: input.widgetId,
    closedAt: now,
  });

  const handoffSessionId = `ho_${randomUUID()}`;

  try {
    await ConversationSession.create({
      sessionId: handoffSessionId,
      chatSessionId,
      visitorId: typeof input.visitorId === 'string' ? input.visitorId.trim() : '',
      userId,
      widgetId: input.widgetId,
      agentId: input.agentId || '',
      escalated: true,
      inboxStatus: 'open',
      handoffContact: input.contactInfo,
      handoffMessage: input.userMessage?.trim() || '',
      handoffAt: now,
      startedAt: now,
      messageCount: 0,
      lastVisitorMessageAt: now,
      humanMode: true,
      humanModeAt: now,
    });
    return handoffSessionId;
  } catch (err) {
    console.error('[inbox] prepareHandoffInboxSession failed:', handoffSessionId, err);
    return null;
  }
}

/** @deprecated Usar prepareHandoffInboxSession */
export async function upsertHandoffInboxSession(input: HandoffSessionInput): Promise<string | null> {
  return prepareHandoffInboxSession(input);
}

export function isWhatsAppServiceWindowOpen(lastOwnerInboundAt?: Date | null, now = Date.now()): boolean {
  if (!(lastOwnerInboundAt instanceof Date) || Number.isNaN(lastOwnerInboundAt.getTime())) return false;
  return now - lastOwnerInboundAt.getTime() < MS_24H;
}

/** sessionId del chat para buscar mensajes (entradas ho_* guardan chatSessionId). */
export function inboxTranscriptSessionId(session: {
  sessionId: string;
  chatSessionId?: string | null;
}): string {
  const chatId = typeof session.chatSessionId === 'string' ? session.chatSessionId.trim() : '';
  return chatId || session.sessionId;
}

/** IDs posibles bajo los que pueden estar guardados los mensajes de una sesión. */
export function transcriptSessionIdCandidates(session: {
  sessionId: string;
  chatSessionId?: string | null;
}): string[] {
  const ids: string[] = [];
  const push = (raw: string) => {
    const id = raw.trim();
    if (id && !ids.includes(id)) ids.push(id);
  };
  push(inboxTranscriptSessionId(session));
  push(session.sessionId);
  if (typeof session.chatSessionId === 'string') push(session.chatSessionId);
  return ids;
}

/** Criterio de sesiones que deben aparecer en Inbox. */
export function inboxSessionFilter(userId: string, status: 'open' | 'resolved' | 'all' = 'open') {
  const uid = String(userId).trim();
  const base: Record<string, unknown> = {
    userId: uid,
    escalated: true,
    $or: [
      { handoffAt: { $exists: true, $ne: null } },
      { handoffContact: { $type: 'object' } },
    ],
  };
  if (status === 'open') base.inboxStatus = { $ne: 'resolved' };
  else if (status === 'resolved') base.inboxStatus = 'resolved';
  return base;
}
