/**
 * Avisos de vencimiento: cortesía y suspensión.
 *
 * Problema real que resuelve: cuando a un cliente se le vencía el plan, perdía
 * el acceso de un momento a otro y sin ningún correo — se enteraba al entrar y
 * encontrarse el panel bloqueado. Además, la mayoría de las cuentas se
 * gestionan a mano (sin pasarela), así que nunca pasan por `past_due` ni
 * disparan el webhook de pago fallido de Lemon Squeezy: para ellas este es el
 * único aviso posible.
 *
 * Por eso el flujo se apoya en la FECHA DE VENCIMIENTO (`currentPeriodEnd`) y
 * no en el estado que reporta la pasarela.
 *
 * Corre una vez al día desde el mismo cron que los recordatorios previos
 * (`/api/internal/subscription-reminders`, Vercel Cron 13:00 UTC).
 */
import { connectDB } from '@/lib/db/connection';
import { Subscription, User } from '@/lib/db/models';
import { sendSubscriptionEmail } from '@/lib/email';
import { isPaidProductPlan } from '@/lib/plan-catalog';
import { GRACE_PERIOD_DAYS } from '@/lib/subscription';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días DENTRO de la cortesía en los que se avisa (0 = el día que vence). */
export const GRACE_NOTICE_DAYS = [0, 3, 6] as const;

type SubDoc = {
  _id: { toString(): string };
  userId: string;
  plan?: string;
  status?: string;
  currentPeriodEnd?: number;
  reminderHistory?: string[];
};

type UserDoc = {
  _id: { toString(): string };
  email: string;
  displayName?: string | null;
  role?: string;
};

export type SuspensionNoticeKind = 'grace' | 'suspended';

export type RunSuspensionNoticesOptions = {
  /** Por defecto true: no manda correos ni escribe marcas. */
  dryRun?: boolean;
  limit?: number;
};

export type RunSuspensionNoticesResult = {
  ok: true;
  dryRun: boolean;
  checkedSubscriptions: number;
  noticesFound: number;
  noticesSent: number;
  report: Array<{
    userId: string;
    email: string;
    kind: SuspensionNoticeKind;
    plan: string;
    /** Días transcurridos desde el vencimiento (solo en 'grace'). */
    dayIntoGrace?: number;
    /** Días que faltan para el corte (solo en 'grace'). */
    daysLeft?: number;
    expiredAt: string;
    sent: boolean;
  }>;
};

/** Clave idempotente: incluye la fecha de vencimiento para que un ciclo nuevo vuelva a avisar. */
function noticeMark(kind: SuspensionNoticeKind, expiredAtSec: number, day?: number): string {
  const iso = new Date(expiredAtSec * 1000).toISOString().slice(0, 10);
  return kind === 'grace' ? `grace:${day}:${iso}` : `suspended:${iso}`;
}

/** Qué aviso corresponde hoy para un vencimiento dado. `null` = ninguno. */
export function decideNotice(params: {
  expiredAtSec: number;
  nowMs: number;
  alreadyMarks: string[];
}): { kind: SuspensionNoticeKind; mark: string; dayIntoGrace?: number; daysLeft?: number } | null {
  const { expiredAtSec, nowMs } = params;
  if (!(expiredAtSec > 0)) return null;

  const already = new Set(params.alreadyMarks);
  const expiredAtMs = expiredAtSec * 1000;
  const graceEndsMs = expiredAtMs + GRACE_PERIOD_DAYS * DAY_MS;

  if (nowMs <= graceEndsMs) {
    const dayIntoGrace = Math.floor((nowMs - expiredAtMs) / DAY_MS);

    // Se avisa en los días definidos, PERO si el cliente todavía no recibió
    // ningún aviso de este ciclo se le manda igual, caiga el día que caiga.
    // Cubre dos casos reales: que el cron no corra un día (Vercel falla, se
    // despliega en mal momento) y el arranque mismo de esta función, con
    // clientes que ya estaban en cortesía y se habrían saltado el día 0.
    const isNoticeDay = (GRACE_NOTICE_DAYS as readonly number[]).includes(dayIntoGrace);
    const iso = new Date(expiredAtMs).toISOString().slice(0, 10);
    const yaAvisadoEsteCiclo = [...already].some(
      (m) => m.startsWith('grace:') && m.endsWith(`:${iso}`),
    );
    if (!isNoticeDay && yaAvisadoEsteCiclo) return null;

    const mark = noticeMark('grace', expiredAtSec, dayIntoGrace);
    if (already.has(mark)) return null;
    return {
      kind: 'grace',
      mark,
      dayIntoGrace,
      daysLeft: Math.max(0, Math.ceil((graceEndsMs - nowMs) / DAY_MS)),
    };
  }

  const mark = noticeMark('suspended', expiredAtSec);
  if (already.has(mark)) return null;
  return { kind: 'suspended', mark };
}

export async function runSuspensionNotices(
  options: RunSuspensionNoticesOptions = {},
): Promise<RunSuspensionNoticesResult> {
  const dryRun = options.dryRun !== false;
  const limit = Math.max(1, Math.min(options.limit ?? 500, 5000));

  await connectDB();

  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);

  const [subs, users] = await Promise.all([
    Subscription.find({
      status: { $ne: 'canceled' },
      currentPeriodEnd: { $gt: 0, $lte: nowSec },
    })
      .select({ userId: 1, plan: 1, status: 1, currentPeriodEnd: 1, reminderHistory: 1 })
      .limit(limit)
      .lean() as Promise<SubDoc[]>,
    User.find({ role: { $ne: 'admin' } })
      .select({ email: 1, displayName: 1, role: 1 })
      .lean() as Promise<UserDoc[]>,
  ]);

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));
  const report: RunSuspensionNoticesResult['report'] = [];
  let noticesSent = 0;

  for (const sub of subs) {
    const plan = sub.plan || 'free';
    if (!isPaidProductPlan(plan)) continue;

    const owner = userMap.get(sub.userId);
    if (!owner?.email) continue;

    const expiredAtSec = sub.currentPeriodEnd as number;
    const expiredAtMs = expiredAtSec * 1000;
    const graceEndsMs = expiredAtMs + GRACE_PERIOD_DAYS * DAY_MS;
    const decision = decideNotice({ expiredAtSec, nowMs, alreadyMarks: sub.reminderHistory || [] });
    if (!decision) continue;
    const { kind, dayIntoGrace, daysLeft } = decision;

    if (!dryRun) {
      await sendSubscriptionEmail(owner.email, kind, plan, {
        graceEndsAt: new Date(graceEndsMs),
        daysLeft,
      });
      await Subscription.updateOne({ _id: sub._id }, { $addToSet: { reminderHistory: decision.mark } });
      noticesSent += 1;
    }

    report.push({
      userId: sub.userId,
      email: owner.email,
      kind,
      plan,
      dayIntoGrace,
      daysLeft,
      expiredAt: new Date(expiredAtMs).toISOString(),
      sent: !dryRun,
    });
  }

  return {
    ok: true,
    dryRun,
    checkedSubscriptions: subs.length,
    noticesFound: report.length,
    noticesSent,
    report,
  };
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
    const mark = noticeMark('suspended', expiredAtSec);
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
