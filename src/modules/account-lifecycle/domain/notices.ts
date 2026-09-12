/**
 * Política de avisos del ciclo de vida: QUÉ correo corresponde hoy a una
 * cuenta. Pura — no manda nada ni toca la base; eso lo hacen los casos de uso
 * a través de los ports.
 *
 * Tres familias, que no se pisan en el tiempo:
 *   - cortesía (días 0/3/6 tras vencer) y suspensión (una vez al perder el
 *     acceso) — vigentes desde antes, comportamiento idéntico;
 *   - aviso de borrado: semanal, mientras la cuenta está en `pending_deletion`.
 *
 * Idempotencia: cada aviso lleva una marca que se guarda en `reminderHistory`.
 * La marca incluye la fecha del ciclo, así un vencimiento nuevo vuelve a avisar.
 */
import { GRACE_PERIOD_DAYS } from '@/lib/subscription-access';
import { DELETION_WARNING_AFTER_DAYS, type Lifecycle } from './lifecycle';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días DENTRO de la cortesía en los que se avisa (0 = el día que vence). */
export const GRACE_NOTICE_DAYS = [0, 3, 6] as const;

export type NoticeKind = 'grace' | 'suspended' | 'deletion_warning' | 'account_deleted';

export type NoticeDecision = {
  kind: NoticeKind;
  /** Clave idempotente (se guarda en reminderHistory). */
  mark: string;
  /** Días transcurridos de la cortesía (solo 'grace'). */
  dayIntoGrace?: number;
  /** Días que faltan: al corte en 'grace', al borrado en 'deletion_warning'. */
  daysLeft?: number;
  /** Cuándo se borra la cuenta (solo 'deletion_warning'). */
  deletionAtSec?: number;
  /** Semana del aviso de borrado, 0 = la primera (solo 'deletion_warning'). */
  weekIndex?: number;
};

const isoDay = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

function paymentMark(kind: 'grace' | 'suspended', expiredAtSec: number, day?: number): string {
  const iso = isoDay(expiredAtSec);
  return kind === 'grace' ? `grace:${day}:${iso}` : `suspended:${iso}`;
}

/**
 * Cortesía o suspensión para un vencimiento dado. `null` = ningún aviso hoy.
 * (Comportamiento idéntico al que ya corría en producción.)
 */
export function decidePaymentNotice(params: {
  expiredAtSec: number;
  nowMs: number;
  alreadyMarks: string[];
}): NoticeDecision | null {
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
    const iso = isoDay(expiredAtSec);
    const yaAvisadoEsteCiclo = [...already].some(
      (m) => m.startsWith('grace:') && m.endsWith(`:${iso}`),
    );
    if (!isNoticeDay && yaAvisadoEsteCiclo) return null;

    const mark = paymentMark('grace', expiredAtSec, dayIntoGrace);
    if (already.has(mark)) return null;
    return {
      kind: 'grace',
      mark,
      dayIntoGrace,
      daysLeft: Math.max(0, Math.ceil((graceEndsMs - nowMs) / DAY_MS)),
    };
  }

  const mark = paymentMark('suspended', expiredAtSec);
  if (already.has(mark)) return null;
  return { kind: 'suspended', mark };
}

/**
 * Aviso semanal de borrado. Solo en `pending_deletion`, uno por semana.
 *
 * Si el cron no corre una semana, NO se recupera el aviso perdido: la próxima
 * corrida manda el de la semana en curso. Recuperar los atrasados dispararía
 * varios correos juntos del mismo tenor — ruido, no información.
 */
export function decideDeletionWarning(params: {
  lifecycle: Lifecycle;
  nowMs: number;
  alreadyMarks: string[];
}): NoticeDecision | null {
  const { lifecycle, nowMs } = params;
  if (lifecycle.stage !== 'pending_deletion') return null;

  const weekIndex = Math.floor((lifecycle.daysSuspended - DELETION_WARNING_AFTER_DAYS) / 7);
  const mark = `deletion_warning:${weekIndex}:${isoDay(lifecycle.suspendedAtSec)}`;
  if (params.alreadyMarks.includes(mark)) return null;

  return {
    kind: 'deletion_warning',
    mark,
    weekIndex,
    deletionAtSec: lifecycle.deletionAtSec,
    daysLeft: Math.max(0, Math.ceil((lifecycle.deletionAtSec * 1000 - nowMs) / DAY_MS)),
  };
}

/** Marca del correo final, enviado tras el borrado. */
export function accountDeletedMark(lifecycle: Lifecycle): string {
  return `account_deleted:${isoDay(lifecycle.suspendedAtSec)}`;
}
