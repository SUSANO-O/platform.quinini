/**
 * Capa de compatibilidad. La lógica de avisos vive ahora en
 * `src/modules/account-lifecycle` (dominio + casos de uso + adaptadores);
 * acá quedan solo el reexport que consumen los tests ya existentes y la
 * utilidad puntual de marcado para el estreno de la política.
 */
import { connectDB } from '@/lib/db/connection';
import { Subscription } from '@/lib/db/models';
import { isPaidProductPlan } from '@/lib/plan-catalog';
import { GRACE_PERIOD_DAYS } from '@/lib/subscription-access';

export { GRACE_NOTICE_DAYS, decidePaymentNotice as decideNotice } from '@/modules/account-lifecycle/domain/notices';

const DAY_MS = 24 * 60 * 60 * 1000;

type SubDoc = {
  _id: { toString(): string };
  userId: string;
  plan?: string;
  currentPeriodEnd?: number;
  reminderHistory?: string[];
};

function noticeMark(expiredAtSec: number): string {
  return `suspended:${new Date(expiredAtSec * 1000).toISOString().slice(0, 10)}`;
}

/**
 * Arranque limpio: marca como "ya avisadas" las suscripciones que vencieron
 * antes de poner esto en marcha, para que no reciban de golpe un correo de
 * suspensión fuera de contexto (hay cuentas vencidas hace meses).
 *
 * Solo toca las que ya quedaron FUERA de la ventana de cortesía; las que
 * vencieron dentro de los últimos días entran por el flujo normal.
 */
export async function markLegacyExpiredAsNotified(
  options: { dryRun?: boolean } = {},
): Promise<{ ok: true; dryRun: boolean; matched: number; marked: number; detail: Array<{ userId: string; plan: string; expiredAt: string; daysAgo: number }> }> {
  const dryRun = options.dryRun !== false;
  await connectDB();

  const nowMs = Date.now();
  const cutoffSec = Math.floor((nowMs - GRACE_PERIOD_DAYS * DAY_MS) / 1000);

  const subs = (await Subscription.find({
    status: { $ne: 'canceled' },
    currentPeriodEnd: { $gt: 0, $lte: cutoffSec },
  })
    .select({ userId: 1, plan: 1, currentPeriodEnd: 1, reminderHistory: 1 })
    .lean()) as SubDoc[];

  const detail: Array<{ userId: string; plan: string; expiredAt: string; daysAgo: number }> = [];
  let marked = 0;

  for (const sub of subs) {
    const plan = sub.plan || 'free';
    if (!isPaidProductPlan(plan)) continue;
    const expiredAtSec = sub.currentPeriodEnd as number;
    const mark = noticeMark(expiredAtSec);
    detail.push({
      userId: sub.userId,
      plan,
      expiredAt: new Date(expiredAtSec * 1000).toISOString(),
      daysAgo: Math.floor((nowMs - expiredAtSec * 1000) / DAY_MS),
    });
    if (!dryRun) {
      await Subscription.updateOne({ _id: sub._id }, { $addToSet: { reminderHistory: mark } });
      marked += 1;
    }
  }

  return { ok: true, dryRun, matched: detail.length, marked, detail };
}
