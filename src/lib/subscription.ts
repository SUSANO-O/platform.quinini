/**
 * Gestión de estado de suscripción y sincronización con LemonSqueezy.
 * Paddle comentado — migrado a LS.
 */

import { connectDB } from './db/connection';
import { Subscription as SubscriptionModel } from './db/models';
import {
  mapLSStatusToDb,
  planFromLSVariantId,
  ensureLSSetup,
} from './lemonsqueezy';
import { isPaidProductPlan } from './plan-catalog';
import { getSubscription as getLSSubscription } from '@lemonsqueezy/lemonsqueezy.js';
import {
  readLSCancelAtPeriodEnd,
  readLSPeriodEndSeconds,
  readLSCreatedSeconds,
} from './payment/lemonsqueezy-adapter';

export { mapLSStatusToDb, planFromLSVariantId };

export async function ensureTrial(userId: string) {
  await connectDB();

  let sub = await SubscriptionModel.findOne({ userId });

  if (!sub) {
    sub = await SubscriptionModel.create({
      userId,
      status: 'incomplete',
      plan: 'free',
      trialStartedAt: null,
      trialEndsAt: null,
    });
  }

  return sub;
}

export function readCancelAtPeriodEnd(sub: unknown): boolean {
  return readLSCancelAtPeriodEnd(sub);
}

export function readCurrentPeriodEndSeconds(sub: unknown): number {
  return readLSPeriodEndSeconds(sub);
}

export function readCurrentPeriodStartSeconds(_sub: unknown): number {
  return 0; // LS no expone period start directamente
}

export function readSubscriptionCreatedSeconds(sub: unknown): number {
  return readLSCreatedSeconds(sub);
}

/**
 * Reconcilia MongoDB con LemonSqueezy cuando tenemos el ID de suscripción.
 * No escribe si el plan lo gestiona el admin (cobros manuales / override).
 */
export async function syncSubscriptionFromLS(userId: string) {
  if (!process.env.LEMONSQUEEZY_API_KEY) return;

  await connectDB();
  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub?.lsSubscriptionId) return;
  if ((sub as { planManagedBy?: string | null }).planManagedBy === 'admin') return;

  ensureLSSetup();
  try {
    const { data, error } = await getLSSubscription(sub.lsSubscriptionId as never);
    if (error || !data) return;

    const attr = (data as unknown as {
      data?: {
        attributes?: {
          status?: string;
          variant_id?: number;
          customer_id?: number;
          cancelled?: boolean;
          renews_at?: string | null;
          ends_at?: string | null;
          created_at?: string;
        };
      };
    })?.data?.attributes;

    if (!attr) return;

    const mapped = mapLSStatusToDb(attr.status);
    const currentPeriodEnd = attr.cancelled
      ? (attr.ends_at ? Math.floor(new Date(attr.ends_at).getTime() / 1000) : 0)
      : (attr.renews_at ? Math.floor(new Date(attr.renews_at).getTime() / 1000) : 0);
    const cancelAtEnd = attr.cancelled === true && attr.status === 'active';
    const resolvedPlan = planFromLSVariantId(attr.variant_id);
    const created = attr.created_at
      ? Math.floor(new Date(attr.created_at).getTime() / 1000)
      : 0;

    const update: Record<string, unknown> = {
      status: mapped,
      currentPeriodEnd,
      cancelAtPeriodEnd: cancelAtEnd,
      stripeSubscriptionCreated: created,
    };
    if (attr.customer_id) update.lsCustomerId = String(attr.customer_id);
    if (resolvedPlan) update.plan = resolvedPlan;

    await SubscriptionModel.findOneAndUpdate({ userId }, { $set: update });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Subscription] LS sync error:', msg);
  }
}

/** Alias para compatibilidad con código existente */
export const syncSubscriptionFromPaddle = syncSubscriptionFromLS;
export const syncSubscriptionFromStripe = syncSubscriptionFromLS;


export async function getSubscription(userId: string) {
  await connectDB();
  return SubscriptionModel.findOne({ userId });
}

type SubscriptionDoc = {
  status: string;
  plan: string;
  currentPeriodEnd: number;
  currentPeriodStart?: number;
  stripeSubscriptionCreated?: number;
  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  lsSubscriptionId?: string | null;
  paddleSubscriptionId?: string | null;
  features?: string[];
  updatedAt?: Date;
};

/** Acceso solo con plan de pago vigente (sin plan Free ni trials de producto). */
export function resolveSubscriptionAccess(doc: SubscriptionDoc, nowMs = Date.now()) {
  const nowSec = nowMs / 1000;
  const hasBillingProvider = Boolean(doc.lsSubscriptionId || doc.paddleSubscriptionId);
  const paidPlan = isPaidProductPlan(doc.plan);
  const periodExpired = doc.currentPeriodEnd > 0 && doc.currentPeriodEnd <= nowSec;

  const isPaidActive =
    paidPlan &&
    !periodExpired &&
    (doc.status === 'active' ||
      (doc.status === 'trialing' && hasBillingProvider) ||
      doc.status === 'past_due' ||
      (doc.status === 'incomplete' && paidPlan && hasBillingProvider));

  return {
    hasAccess: isPaidActive,
    isPremium: isPaidActive,
    isTrialActive: false,
    trialDaysRemaining: 0,
    hasStripeSubscription: hasBillingProvider,
  };
}

export async function getSubscriptionStatus(userId: string) {
  const sub = await ensureTrial(userId);
  const doc = (sub.toObject ? sub.toObject() : sub) as SubscriptionDoc;
  const access = resolveSubscriptionAccess(doc);
  const cancelAtPeriodEnd = Boolean(doc.cancelAtPeriodEnd);
  const subscriptionUpdatedAt = doc.updatedAt
    ? new Date(doc.updatedAt).getTime()
    : 0;

  return {
    ...access,
    subscriptionUpdatedAt,
    subscription: {
      status: doc.status,
      plan: doc.plan,
      currentPeriodEnd: doc.currentPeriodEnd,
      currentPeriodStart: doc.currentPeriodStart ?? 0,
      stripeSubscriptionCreated: doc.stripeSubscriptionCreated ?? 0,
      trialStartedAt: doc.trialStartedAt,
      trialEndsAt: doc.trialEndsAt,
      cancelAtPeriodEnd,
      features: Array.isArray(doc.features) ? doc.features : [],
    },
  };
}

// ── Paddle (comentado) ────────────────────────────────────────────────────────
// import { paddle } from './paddle';
// import { mapPaddleStatusToDb, resolvePlanFromPaddleSubscription, isoToEpochExport } from './payment/paddle-adapter';
// export async function syncSubscriptionFromPaddle(userId) { ... }
// → Ver git history para la implementación completa de Paddle.
