/**
 * Crea una entrada de Inbox por cada solicitud de handoff (no sobrescribe solicitudes anteriores).
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

export async function upsertHandoffInboxSession(input: HandoffSessionInput): Promise<string | null> {
  const chatSessionId = input.sessionId.trim();
  const userId = String(input.userId).trim();
  if (!chatSessionId || !userId) return null;

  const now = input.handoffAt ?? new Date();
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
      lastVisitorMessageAt: now, // nueva solicitud sin ver por el agente
    });
    return handoffSessionId;
  } catch (err) {
    console.error('[inbox] upsertHandoffInboxSession failed:', handoffSessionId, err);
    return null;
  }
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
