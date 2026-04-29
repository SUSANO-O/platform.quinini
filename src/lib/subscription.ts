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
import { getSubscription as getLSSubscription } from '@lemonsqueezy/lemonsqueezy.js';
import {
  readLSCancelAtPeriodEnd,
  readLSPeriodEndSeconds,
  readLSCreatedSeconds,
} from './payment/lemonsqueezy-adapter';

export { mapLSStatusToDb, planFromLSVariantId };

const TRIAL_DAYS = 7;

// ── helpers de periodo para mantener compatibilidad con billing/webhook ──────

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
 */
export async function syncSubscriptionFromLS(userId: string) {
  if (!process.env.LEMONSQUEEZY_API_KEY) return;

  await connectDB();
  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub?.lsSubscriptionId) return;

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

export async function ensureTrial(userId: string) {
  await connectDB();

  let sub = await SubscriptionModel.findOne({ userId });

  if (!sub) {
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    sub = await SubscriptionModel.create({
      userId,
      status: 'trialing',
      plan: 'free',
      trialStartedAt,
      trialEndsAt,
    });
  }

  return sub;
}

export async function getSubscription(userId: string) {
  await connectDB();
  return SubscriptionModel.findOne({ userId });
}

export async function getSubscriptionStatus(userId: string) {
  const sub = await ensureTrial(userId);
  await syncSubscriptionFromLS(userId);

  const fresh = await SubscriptionModel.findOne({ userId });
  const doc = fresh || sub;
  const now = Date.now();
  const nowSec = now / 1000;

  // hasStripeSubscription: compatibilidad con frontend — true si hay suscripción LS (o Paddle legacy)
  const hasStripeSubscription = Boolean(doc.lsSubscriptionId || doc.paddleSubscriptionId);
  const paidStatuses = ['active', 'trialing', 'past_due'];
  const periodOk = doc.currentPeriodEnd > nowSec;
  const statusOk =
    paidStatuses.includes(doc.status) ||
    (doc.status === 'incomplete' &&
      ['starter', 'growth', 'business', 'enterprise'].includes(doc.plan));
  const paidPlan = ['starter', 'growth', 'business', 'enterprise'].includes(doc.plan);
  const periodMissingButPaid =
    doc.currentPeriodEnd <= 0 &&
    paidPlan &&
    (doc.status === 'active' || doc.status === 'incomplete');
  const isPaidActive =
    hasStripeSubscription && statusOk && (periodOk || periodMissingButPaid);

  const trialEndsAt = doc.trialEndsAt ? new Date(doc.trialEndsAt).getTime() : 0;
  const isTrialActive = doc.status === 'trialing' && !hasStripeSubscription && trialEndsAt > now;
  const trialDaysRemaining = isTrialActive
    ? Math.max(0, Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24)))
    : 0;

  const hasAccess = isPaidActive || isTrialActive;
  const cancelAtPeriodEnd = Boolean((doc as { cancelAtPeriodEnd?: boolean }).cancelAtPeriodEnd);

  return {
    hasAccess,
    isPremium: isPaidActive,
    isTrialActive,
    trialDaysRemaining,
    hasStripeSubscription,
    subscription: {
      status: doc.status,
      plan: doc.plan,
      currentPeriodEnd: doc.currentPeriodEnd,
      currentPeriodStart: doc.currentPeriodStart ?? 0,
      stripeSubscriptionCreated: doc.stripeSubscriptionCreated ?? 0,
      trialStartedAt: doc.trialStartedAt,
      trialEndsAt: doc.trialEndsAt,
      cancelAtPeriodEnd,
    },
  };
}

// ── Paddle (comentado) ────────────────────────────────────────────────────────
// import { paddle } from './paddle';
// import { mapPaddleStatusToDb, resolvePlanFromPaddleSubscription, isoToEpochExport } from './payment/paddle-adapter';
// export async function syncSubscriptionFromPaddle(userId) { ... }
// → Ver git history para la implementación completa de Paddle.
