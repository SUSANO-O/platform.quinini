import { connectDB } from '@/lib/db/connection';
import { AccountDeletionRecord } from '@/lib/db/models';
import type { IDeletionRecords, DeletionRecordStart } from '../ports/IDeletionRecords';
import type { PurgeCounts } from '../ports/IAccountPurger';

/** Constancia permanente de cada borrado. Nunca se purga. */
export const mongoDeletionRecords: IDeletionRecords = {
  async start(record: DeletionRecordStart): Promise<string> {
    await connectDB();
    const doc = await AccountDeletionRecord.create({
      userId: record.accountId,
      email: record.email,
      plan: record.plan,
      suspendedAt: record.suspendedAt,
      scheduledFor: record.scheduledFor,
      owned: record.owned,
      planned: record.planned,
      notices: record.notices,
      status: 'started',
    });
    return String(doc._id);
  },

  async complete(recordId: string, result: { purged: Record<string, PurgeCounts>; exportLocation: string }): Promise<void> {
    await connectDB();
    await AccountDeletionRecord.updateOne(
      { _id: recordId },
      { $set: { status: 'completed', purged: result.purged, exportLocation: result.exportLocation, completedAt: new Date() } },
    );
  },

  async fail(recordId: string, error: string): Promise<void> {
    await connectDB();
    await AccountDeletionRecord.updateOne(
      { _id: recordId },
      { $set: { status: 'failed', error: error.slice(0, 2000), completedAt: new Date() } },
    );
  },
};
