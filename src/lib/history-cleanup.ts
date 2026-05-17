/**
 * Limpieza de historial de conversaciones según el plan del usuario.
 * Elimina ConversationSession más antiguas que el límite de retención del plan.
 */

import { connectDB } from '@/lib/db/connection';
import { ConversationSession, Subscription } from '@/lib/db/models';
import { PLAN_HISTORY_RETENTION_DAYS } from '@/lib/plan-catalog';

export interface HistoryCleanupResult {
  processed: number;
  deleted: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
}

export async function runHistoryCleanup(opts: { dryRun?: boolean } = {}): Promise<HistoryCleanupResult> {
  const { dryRun = false } = opts;
  await connectDB();

  const result: HistoryCleanupResult = { processed: 0, deleted: 0, skipped: 0, errors: 0, dryRun };

  // Agrupa usuarios por plan para hacer el borrado por lotes
  const planGroups: Record<string, string[]> = {};

  const subs = await Subscription.find({}).select({ userId: 1, plan: 1, status: 1 }).lean() as {
    userId: string;
    plan?: string;
    status?: string;
  }[];

  for (const sub of subs) {
    const isActive = sub.status === 'active' || sub.status === 'trialing';
    const plan = isActive ? (sub.plan ?? 'free') : 'free';
    if (!planGroups[plan]) planGroups[plan] = [];
    planGroups[plan].push(String(sub.userId));
  }

  for (const [plan, userIds] of Object.entries(planGroups)) {
    const retentionDays = PLAN_HISTORY_RETENTION_DAYS[plan] ?? PLAN_HISTORY_RETENTION_DAYS.free;

    // Ilimitado: no borrar nada
    if (retentionDays === -1) {
      result.skipped += userIds.length;
      continue;
    }

    result.processed += userIds.length;

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    try {
      if (dryRun) {
        const count = await ConversationSession.countDocuments({
          userId: { $in: userIds },
          startedAt: { $lt: cutoff },
        });
        result.deleted += count;
      } else {
        const { deletedCount } = await ConversationSession.deleteMany({
          userId: { $in: userIds },
          startedAt: { $lt: cutoff },
        });
        result.deleted += deletedCount ?? 0;
      }
    } catch {
      result.errors++;
    }
  }

  // Usuarios sin suscripción → tratar como free
  const usersWithSub = new Set(subs.map((s) => String(s.userId)));
  const freeCutoff = new Date(Date.now() - PLAN_HISTORY_RETENTION_DAYS.free * 24 * 60 * 60 * 1000);

  try {
    if (dryRun) {
      const count = await ConversationSession.countDocuments({
        userId: { $nin: Array.from(usersWithSub) },
        startedAt: { $lt: freeCutoff },
      });
      result.deleted += count;
    } else {
      const { deletedCount } = await ConversationSession.deleteMany({
        userId: { $nin: Array.from(usersWithSub) },
        startedAt: { $lt: freeCutoff },
      });
      result.deleted += deletedCount ?? 0;
    }
  } catch {
    result.errors++;
  }

  return result;
}
