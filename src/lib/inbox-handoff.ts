/**
 * Persiste / actualiza una sesión escalada en Inbox (sessionId es único globalmente).
 */
import { ConversationSession } from '@/lib/db/models';

export type HandoffSessionInput = {
  sessionId: string;
  userId: string;
  widgetId: string;
  agentId?: string;
  contactInfo: { name: string; email: string; phone: string };
  userMessage?: string;
  handoffAt?: Date;
};

export async function upsertHandoffInboxSession(input: HandoffSessionInput): Promise<boolean> {
  const sessionId = input.sessionId.trim();
  const userId = String(input.userId).trim();
  if (!sessionId || !userId) return false;

  const now = input.handoffAt ?? new Date();

  try {
    await ConversationSession.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          escalated: true,
          inboxStatus: 'open',
          handoffContact: input.contactInfo,
          handoffMessage: input.userMessage?.trim() || '',
          handoffAt: now,
          widgetId: input.widgetId,
          agentId: input.agentId || '',
          userId,
        },
        $setOnInsert: {
          sessionId,
          startedAt: now,
          messageCount: 0,
        },
      },
      { upsert: true, new: true },
    );
    return true;
  } catch (err) {
    console.error('[inbox] upsertHandoffInboxSession failed:', sessionId, err);
    return false;
  }
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
