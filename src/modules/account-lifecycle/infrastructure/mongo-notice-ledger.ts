import { connectDB } from '@/lib/db/connection';
import { AccountLifecycleNotice } from '@/lib/db/models';
import type { INoticeLedger, LedgerEntry } from '../ports/INoticeLedger';

/** Bitácora permanente de avisos: sobrevive al borrado de la cuenta. */
export const mongoNoticeLedger: INoticeLedger = {
  async append(entry: LedgerEntry): Promise<void> {
    await connectDB();
    await AccountLifecycleNotice.create(entry);
  },

  async listFor(userId: string): Promise<LedgerEntry[]> {
    await connectDB();
    const rows = (await AccountLifecycleNotice.find({ userId })
      .select({ userId: 1, email: 1, kind: 1, mark: 1, sentAt: 1 })
      .sort({ sentAt: 1 })
      .lean()) as LedgerEntry[];
    return rows.map((r) => ({ userId: r.userId, email: r.email, kind: r.kind, mark: r.mark, sentAt: r.sentAt }));
  },
};
