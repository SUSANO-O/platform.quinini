/**
 * Ciclo de vida de una cuenta que dejó de pagar: qué ve, qué se le avisa y
 * cuándo se borran sus datos. ÚNICA fuente de verdad — el panel, los correos
 * semanales y el cron de borrado leen todos de `resolveLifecycle`, para que no
 * puedan desincronizarse (que el panel diga "se borra el 10/03" y el cron borre
 * otro día sería justo el tipo de error que acá no se puede permitir).
 *
 * Todo se mide desde que la cuenta PIERDE EL ACCESO (fin de la cortesía de
 * `GRACE_PERIOD_DAYS`), no desde el vencimiento del plan.
 *
 *   sin acceso      panel                      correos
 *   < 30 días       gris + ícono del plan      —
 *   30–90 días      modal de precios           —
 *   90–180 días     aviso de borrado           semanal
 *   ≥ 180 días      —                          el cron borra
 *
 * La política solo aplica a planes de pago vencidos por falta de pago. Quedan
 * afuera los planes free, las cancelaciones voluntarias (que el cliente decidió
 * irse no es "no pagar") y cualquier cuenta sin fecha de vencimiento: ante la
 * duda, `not_applicable` — nunca se programa el borrado de algo que no está
 * inequívocamente vencido.
 */
import { graceEndsAtSeconds, resolveSubscriptionAccess } from '@/lib/subscription-access';
import { isPaidProductPlan } from '@/lib/plan-catalog';

const DAY_SEC = 24 * 60 * 60;

/**
 * Estreno de la política. "Solo casos nuevos": una cuenta que ya estaba sin
 * acceso antes de esta fecha arranca su cuenta regresiva DESDE ACÁ, no desde
 * su vencimiento real — si no, cuentas vencidas hace meses habrían recibido de
 * golpe un aviso de borrado inminente.
 */
export const LIFECYCLE_POLICY_START_SEC = Math.floor(Date.UTC(2026, 8, 11) / 1000); // 2026-09-11

/** Días sin acceso a partir de los cuales el panel muestra los precios. */
export const PRICING_STAGE_AFTER_DAYS = 30;
/** Días sin acceso a partir de los cuales se avisa el borrado (y arrancan los correos). */
export const DELETION_WARNING_AFTER_DAYS = 90;
/** Ventana de aviso antes del borrado ("en menos de 90 días"). */
export const DELETION_WINDOW_DAYS = 90;
/** Días sin acceso al cabo de los cuales se borra la cuenta. */
export const DELETION_AFTER_DAYS = DELETION_WARNING_AFTER_DAYS + DELETION_WINDOW_DAYS;

export type LifecycleStage =
  /** Acceso normal. */
  | 'active'
  /** Venció, pero corre la cortesía: acceso completo. */
  | 'grace'
  /** Sin acceso hace menos de 30 días: panel en gris con el ícono del plan. */
  | 'suspended_recent'
  /** Sin acceso hace 30–90 días: modal de precios. */
  | 'suspended_pricing'
  /** Sin acceso hace 90–180 días: aviso de borrado + correo semanal. */
  | 'pending_deletion'
  /** Sin acceso hace 180 días o más: el cron la borra. */
  | 'due_for_deletion'
  /** La política no aplica (free, cancelada, sin fecha, o sin acceso por otro motivo). */
  | 'not_applicable';

export type Lifecycle = {
  stage: LifecycleStage;
  /** Momento en que perdió el acceso (epoch seg). 0 si no está suspendida. */
  suspendedAtSec: number;
  /** Días completos sin acceso. 0 si no está suspendida. */
  daysSuspended: number;
  /** Cuándo se borraría (epoch seg). 0 si no aplica. */
  deletionAtSec: number;
};

type LifecycleDoc = Parameters<typeof resolveSubscriptionAccess>[0];

const NONE = (stage: LifecycleStage): Lifecycle => ({
  stage, suspendedAtSec: 0, daysSuspended: 0, deletionAtSec: 0,
});

export function resolveLifecycle(doc: LifecycleDoc, nowMs = Date.now()): Lifecycle {
  if (!isPaidProductPlan(doc.plan)) return NONE('not_applicable');
  if (doc.status === 'canceled') return NONE('not_applicable');

  const access = resolveSubscriptionAccess(doc, nowMs);
  if (access.inGracePeriod) return NONE('grace');
  if (access.hasAccess) return NONE('active');

  const nowSec = nowMs / 1000;
  // Sin acceso pero SIN haber vencido: no es un caso de falta de pago (es otro
  // gating preexistente, p. ej. un trial manual). Nunca entra al borrado.
  if (!(doc.currentPeriodEnd > 0) || doc.currentPeriodEnd > nowSec) return NONE('not_applicable');

  const graceEnd = graceEndsAtSeconds(doc);
  if (!(graceEnd > 0)) return NONE('not_applicable');

  const suspendedAtSec = Math.max(graceEnd, LIFECYCLE_POLICY_START_SEC);
  const daysSuspended = Math.max(0, Math.floor((nowSec - suspendedAtSec) / DAY_SEC));
  const deletionAtSec = suspendedAtSec + DELETION_AFTER_DAYS * DAY_SEC;

  let stage: LifecycleStage;
  if (daysSuspended >= DELETION_AFTER_DAYS) stage = 'due_for_deletion';
  else if (daysSuspended >= DELETION_WARNING_AFTER_DAYS) stage = 'pending_deletion';
  else if (daysSuspended >= PRICING_STAGE_AFTER_DAYS) stage = 'suspended_pricing';
  else stage = 'suspended_recent';

  return { stage, suspendedAtSec, daysSuspended, deletionAtSec };
}
