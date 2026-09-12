/**
 * Lógica PURA de acceso por suscripción: sin base de datos, sin pasarela.
 *
 * Vive aparte de `subscription.ts` para que el ciclo de vida de la cuenta
 * (`account-lifecycle.ts`) pueda construirse encima sin crear una dependencia
 * circular — `subscription.ts` a su vez expone el ciclo de vida en el estado
 * que consume el dashboard. `subscription.ts` reexporta todo esto, así que los
 * imports existentes siguen funcionando igual.
 */
import { isPaidProductPlan } from './plan-catalog';

/**
 * Campos de la suscripción que determinan el acceso. Acepta el documento
 * completo (los llamadores pasan la suscripción entera, con trialEndsAt,
 * features, etc.): solo se leen estos campos.
 */
export type AccessDoc = {
  status: string;
  plan: string;
  currentPeriodEnd: number;
  lsSubscriptionId?: string | null;
  paddleSubscriptionId?: string | null;
  [otherField: string]: unknown;
};

/**
 * Días de gracia tras vencer el período pagado antes de cortar el servicio.
 *
 * Antes el corte era seco en `currentPeriodEnd`: el cliente perdía el acceso
 * de un momento a otro y sin aviso. Peor aún, la "gracia" real dependía del
 * azar — quien fallaba el pago a principio de ciclo seguía andando semanas y
 * quien fallaba al final se cortaba el mismo día. Ahora todos tienen la misma
 * ventana fija, y durante ella se les avisa por correo (ver
 * `subscription-suspension.ts`).
 */
export const GRACE_PERIOD_DAYS = 7;
const GRACE_PERIOD_SECONDS = GRACE_PERIOD_DAYS * 24 * 60 * 60;

/** Fin de la ventana de gracia (epoch en segundos). 0 si no aplica. */
export function graceEndsAtSeconds(doc: Pick<AccessDoc, 'currentPeriodEnd' | 'status'>): number {
  // Cancelación voluntaria: el cliente decidió irse, no se le regalan días.
  if (doc.status === 'canceled') return 0;
  if (!(doc.currentPeriodEnd > 0)) return 0;
  return doc.currentPeriodEnd + GRACE_PERIOD_SECONDS;
}

/** Acceso solo con plan de pago vigente (sin plan Free ni trials de producto). */
export function resolveSubscriptionAccess(doc: AccessDoc, nowMs = Date.now()) {
  const nowSec = nowMs / 1000;
  const hasBillingProvider = Boolean(doc.lsSubscriptionId || doc.paddleSubscriptionId);
  const paidPlan = isPaidProductPlan(doc.plan);
  const periodExpired = doc.currentPeriodEnd > 0 && doc.currentPeriodEnd <= nowSec;

  const statusAllowsAccess =
    doc.status === 'active' ||
    (doc.status === 'trialing' && hasBillingProvider) ||
    doc.status === 'past_due' ||
    (doc.status === 'incomplete' && paidPlan && hasBillingProvider);

  // Ventana de gracia: el período venció pero todavía no se agotaron los días
  // de cortesía. Acceso completo, igual que un plan al día.
  const graceEndsAt = graceEndsAtSeconds(doc);
  const inGracePeriod =
    paidPlan && periodExpired && graceEndsAt > 0 && nowSec <= graceEndsAt && doc.status !== 'canceled';

  const isPaidActive = (paidPlan && !periodExpired && statusAllowsAccess) || inGracePeriod;

  return {
    hasAccess: isPaidActive,
    isPremium: isPaidActive,
    isTrialActive: false,
    trialDaysRemaining: 0,
    hasStripeSubscription: hasBillingProvider,
    /** true mientras corre la cortesía posterior al vencimiento. */
    inGracePeriod,
    /** Fin de la cortesía (epoch seg), 0 si no aplica. */
    graceEndsAt: inGracePeriod ? graceEndsAt : 0,
  };
}
