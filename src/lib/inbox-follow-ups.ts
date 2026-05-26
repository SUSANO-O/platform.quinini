/**
 * Recordatorios prospectivos en Inbox (sesiones escaladas).
 */

import { connectDB } from '@/lib/db/connection';
import { ConversationSession } from '@/lib/db/models';

export type InboxFollowUpResult = {
  scanned: number;
  due: number;
  markedNotified: number;
};

/** Sesiones con followUpAt vencido y sin notificar. */
export async function processDueInboxFollowUps(opts: {
  dryRun?: boolean;
  limit?: number;
}): Promise<InboxFollowUpResult> {
  const { dryRun = false, limit = 200 } = opts;
  await connectDB();
  const now = new Date();
  const rows = await ConversationSession.find({
    escalated: true,
    inboxStatus: 'open',
    followUpAt: { $lte: now, $ne: null },
    followUpNotified: { $ne: true },
  })
    .sort({ followUpAt: 1 })
    .limit(limit)
    .lean();

  if (dryRun) {
    return { scanned: rows.length, due: rows.length, markedNotified: 0 };
  }

  let marked = 0;
  for (const row of rows) {
    await ConversationSession.updateOne(
      { _id: row._id },
      { $set: { followUpNotified: true } },
    );
    marked++;
  }

  return { scanned: rows.length, due: rows.length, markedNotified: marked };
}
