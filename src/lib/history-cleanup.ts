/**
 * Limpieza de historial de conversaciones según el plan del usuario.
 * Elimina ConversationSession más antiguas que el límite de retención del plan.
 *
 * Diseño para escala:
 * - Suscripciones procesadas en cursor (sin cargar todo en memoria)
 * - $in por lotes de MAX_BATCH_SIZE en vez de arrays gigantes
 * - Usuarios sin suscripción: $lookup aggregation en vez de $nin masivo
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

const MAX_BATCH_SIZE = 500;

function cutoffFor(plan: string): Date | null {
  const days = PLAN_HISTORY_RETENTION_DAYS[plan] ?? PLAN_HISTORY_RETENTION_DAYS.free;
  if (days === -1) return null; // ilimitado
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function deleteBatch(
  userIds: string[],
  cutoff: Date,
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    return ConversationSession.countDocuments({
      userId: { $in: userIds },
      startedAt: { $lt: cutoff },
    });
  }
  const { deletedCount } = await ConversationSession.deleteMany({
    userId: { $in: userIds },
    startedAt: { $lt: cutoff },
  });
  return deletedCount ?? 0;
}

export async function runHistoryCleanup(opts: { dryRun?: boolean } = {}): Promise<HistoryCleanupResult> {
  const { dryRun = false } = opts;
  await connectDB();

  const result: HistoryCleanupResult = { processed: 0, deleted: 0, skipped: 0, errors: 0, dryRun };

  // ── 1. Procesar usuarios con suscripción agrupados por plan ──────────────
  // Usamos cursor para no cargar millones de docs en memoria
  const planBatches: Record<string, string[]> = {};

  const cursor = Subscription.find({})
    .select({ userId: 1, plan: 1, status: 1 })
    .lean()
    .cursor();

  for await (const sub of cursor) {
    const s = sub as { userId: unknown; plan?: string; status?: string };
    const isActive = s.status === 'active' || s.status === 'trialing';
    const plan = isActive ? (s.plan ?? 'free') : 'free';
    const userId = String(s.userId);

    if (!planBatches[plan]) planBatches[plan] = [];
    planBatches[plan].push(userId);

    // Procesar el lote cuando alcanza el tamaño máximo
    if (planBatches[plan].length >= MAX_BATCH_SIZE) {
      const batch = planBatches[plan].splice(0, MAX_BATCH_SIZE);
      const cutoff = cutoffFor(plan);
      if (!cutoff) { result.skipped += batch.length; continue; }
      result.processed += batch.length;
      try {
        result.deleted += await deleteBatch(batch, cutoff, dryRun);
      } catch {
        result.errors++;
      }
    }
  }

  // Vaciar los lotes restantes
  for (const [plan, userIds] of Object.entries(planBatches)) {
    if (!userIds.length) continue;
    const cutoff = cutoffFor(plan);
    if (!cutoff) { result.skipped += userIds.length; continue; }
    result.processed += userIds.length;

    // Procesar en sub-lotes si quedan muchos
    for (let i = 0; i < userIds.length; i += MAX_BATCH_SIZE) {
      const chunk = userIds.slice(i, i + MAX_BATCH_SIZE);
      try {
        result.deleted += await deleteBatch(chunk, cutoff, dryRun);
      } catch {
        result.errors++;
      }
    }
  }

  // ── 2. Usuarios sin suscripción → $lookup en vez de $nin masivo ──────────
  // Busca sesiones antiguas cuyo userId no tenga ninguna suscripción en DB.
  // $lookup es O(indexed join) — no depende del número de usuarios suscritos.
  const freeCutoff = cutoffFor('free')!;

  try {
    const pipeline = [
      { $match: { startedAt: { $lt: freeCutoff } } },
      {
        $lookup: {
          from: 'subscriptions',
          localField: 'userId',
          foreignField: 'userId',
          as: '_sub',
        },
      },
      { $match: { _sub: { $size: 0 } } },
      { $project: { _id: 1 } },
    ];

    // Procesar en lotes para no acumular IDs en memoria
    const aggCursor = ConversationSession.aggregate(pipeline).cursor();
    let idBatch: string[] = [];
    let batchDeleted = 0;

    for await (const doc of aggCursor) {
      idBatch.push(String(doc._id));
      if (idBatch.length >= MAX_BATCH_SIZE) {
        if (dryRun) {
          batchDeleted += idBatch.length;
        } else {
          const { deletedCount } = await ConversationSession.deleteMany({ _id: { $in: idBatch } });
          batchDeleted += deletedCount ?? 0;
        }
        idBatch = [];
      }
    }

    // Último lote
    if (idBatch.length) {
      if (dryRun) {
        batchDeleted += idBatch.length;
      } else {
        const { deletedCount } = await ConversationSession.deleteMany({ _id: { $in: idBatch } });
        batchDeleted += deletedCount ?? 0;
      }
    }

    result.deleted += batchDeleted;
  } catch {
    result.errors++;
  }

  return result;
}
