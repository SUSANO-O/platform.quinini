/**
 * Gestión de estado de suscripción y sincronización con Paddle.
 * La lógica de Stripe está conservada comentada más abajo para referencia.
 */

import { connectDB } from './db/connection';
import { Subscription as SubscriptionModel } from './db/models';
import { paddle } from './paddle';
import {
  mapPaddleStatusToDb,
  resolvePlanFromPaddleSubscription,
  isoToEpochExport as isoToEpoch,
} from './payment/paddle-adapter';

const TRIAL_DAYS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Paddle helpers (activos)
// ─────────────────────────────────────────────────────────────────────────────

export { mapPaddleStatusToDb, resolvePlanFromPaddleSubscription };

export function readCancelAtPeriodEnd(paddleSub: unknown): boolean {
  const s = paddleSub as {
    scheduledChange?: { action?: string } | null;
    scheduled_change?: { action?: string } | null;
  };
  return (s.scheduledChange ?? s.scheduled_change)?.action === 'cancel';
}

export function readCurrentPeriodEndSeconds(paddleSub: unknown): number {
  const s = paddleSub as {
    currentBillingPeriod?: { endsAt?: string };
    current_billing_period?: { ends_at?: string };
    items?: Array<{
      currentBillingPeriod?: { endsAt?: string };
      current_billing_period?: { ends_at?: string };
    }>;
  };
  const iso =
    s.currentBillingPeriod?.endsAt ??
    s.current_billing_period?.ends_at ??
    s.items?.[0]?.currentBillingPeriod?.endsAt ??
    s.items?.[0]?.current_billing_period?.ends_at;
  return isoToEpoch(iso);
}

export function readCurrentPeriodStartSeconds(paddleSub: unknown): number {
  const s = paddleSub as {
    currentBillingPeriod?: { startsAt?: string };
    current_billing_period?: { starts_at?: string };
    items?: Array<{
      currentBillingPeriod?: { startsAt?: string };
      current_billing_period?: { starts_at?: string };
    }>;
  };
  const iso =
    s.currentBillingPeriod?.startsAt ??
    s.current_billing_period?.starts_at ??
    s.items?.[0]?.currentBillingPeriod?.startsAt ??
    s.items?.[0]?.current_billing_period?.starts_at;
  return isoToEpoch(iso);
}

export function readSubscriptionCreatedSeconds(sub: unknown): number {
  const s = sub as { createdAt?: string; created_at?: string };
  return isoToEpoch(s.createdAt ?? s.created_at);
}

/**
 * Reconcilia MongoDB con Paddle cuando tenemos el ID de suscripción.
 * Equivalente a syncSubscriptionFromStripe.
 */
export async function syncSubscriptionFromPaddle(userId: string) {
  if (!process.env.PADDLE_API_KEY) return;

  await connectDB();
  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub) return;

  let subscriptionId: string | null = sub.paddleSubscriptionId ?? null;

  if (!subscriptionId && sub.paddleCustomerId) {
    for await (const paddleSub of paddle.subscriptions.list({
      customerId: sub.paddleCustomerId,
      status: ['active', 'trialing', 'past_due'],
    } as Parameters<typeof paddle.subscriptions.list>[0])) {
      subscriptionId = (paddleSub as unknown as { id: string }).id;
      break;
    }
  }

  if (!subscriptionId) return;

  try {
    const paddleSub = await paddle.subscriptions.get(subscriptionId);
    const raw = paddleSub as unknown as Record<string, unknown>;

    const mapped = mapPaddleStatusToDb(raw.status as string);
    const currentPeriodEnd = readCurrentPeriodEndSeconds(paddleSub);
    const currentPeriodStart = readCurrentPeriodStartSeconds(paddleSub);
    const subCreated = readSubscriptionCreatedSeconds(paddleSub);
    const resolvedPlan = resolvePlanFromPaddleSubscription(paddleSub);
    const cancelAtEnd = readCancelAtPeriodEnd(paddleSub);

    const update: Record<string, unknown> = {
      paddleSubscriptionId: subscriptionId,
      status: mapped,
      currentPeriodEnd,
      currentPeriodStart,
      stripeSubscriptionCreated: subCreated,
      cancelAtPeriodEnd: cancelAtEnd,
    };
    if (raw.customerId) update.paddleCustomerId = raw.customerId;
    if (resolvedPlan) update.plan = resolvedPlan;

    await SubscriptionModel.findOneAndUpdate({ userId }, { $set: update });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Subscription] Paddle sync error:', msg);
  }
}

/** Alias de compatibilidad — usado por billing.ts y tests existentes. */
export const syncSubscriptionFromStripe = syncSubscriptionFromPaddle;

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
  await syncSubscriptionFromPaddle(userId);

  const fresh = await SubscriptionModel.findOne({ userId });
  const doc = fresh || sub;
  const now = Date.now();
  const nowSec = now / 1000;

  // Paddle usa paddleSubscriptionId; reutilizamos el nombre del campo para compat. con el frontend
  const hasStripeSubscription = Boolean(doc.paddleSubscriptionId);
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

// ─────────────────────────────────────────────────────────────────────────────
// ─── STRIPE (comentado — conservado para referencia) ─────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// import type Stripe from 'stripe';
// import { PLANS, stripe } from './stripe';
//
// export function mapStripeStatusToDb(stripeStatus: string): string {
//   switch (stripeStatus) {
//     case 'active': case 'trialing': case 'canceled': case 'past_due': case 'incomplete':
//       return stripeStatus;
//     case 'incomplete_expired': return 'canceled';
//     case 'unpaid': case 'paused': return 'past_due';
//     default: return 'past_due';
//   }
// }
//
// export function planFromStripePriceId(priceId: string | undefined): string | null {
//   if (!priceId) return null;
//   for (const [key, plan] of Object.entries(PLANS)) {
//     if (plan.priceId === priceId) return key;
//   }
//   return null;
// }
//
// // readCurrentPeriodEndSeconds, readCurrentPeriodStartSeconds,
// // readStripeSubscriptionCreatedSeconds, readCancelAtPeriodEnd (Stripe),
// // resolvePlanFromStripeSubscription, syncSubscriptionFromStripe
// // → Ver git history o tag pre-paddle para la implementación completa.
