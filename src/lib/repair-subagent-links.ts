import mongoose from 'mongoose';
import { ClientAgent } from '@/lib/db/models';

/**
 * Alinea `subAgentIds` del padre tras cambiar `type` / `parentAgentId` en un hijo.
 */
export async function repairSubAgentLinks(childId: mongoose.Types.ObjectId): Promise<void> {
  const doc = await ClientAgent.findById(childId).lean();
  if (!doc?.userId) return;

  await ClientAgent.updateMany(
    { userId: doc.userId, subAgentIds: childId.toString() },
    { $pull: { subAgentIds: childId.toString() } },
  );

  if (doc.type === 'sub-agent' && doc.parentAgentId) {
    await ClientAgent.updateOne(
      { _id: doc.parentAgentId, userId: doc.userId },
      { $addToSet: { subAgentIds: childId.toString() } },
    );
  }
}
