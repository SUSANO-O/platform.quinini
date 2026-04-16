import type Stripe from 'stripe';
import { connectDB } from './db/connection';
import { Subscription as SubscriptionModel } from './db/models';
import { PLANS, stripe } from './stripe';

const TRIAL_DAYS = 3;

/** Map Stripe subscription.status to values allowed by our Mongoose schema */
export function mapStripeStatusToDb(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
    case 'canceled':
    case 'past_due':
    case 'incomplete':
      return stripeStatus;
    case 'incomplete_expired':
      return 'canceled';
    case 'unpaid':
    case 'paused':
      return 'past_due';
    default:
      return 'past_due';
  }
}

export function planFromStripePriceId(priceId: string | undefined): string | null {
  if (!priceId) return null;
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.priceId === priceId) return key;
  }
  return null;
}

function getPlanFromStripeSubscription(stripeSub: Stripe.Subscription): string | null {
  const price = stripeSub.items?.data?.[0]?.price;
  const priceId = typeof price === 'string' ? price : price?.id;
  return planFromStripePriceId(priceId);
}

/**
 * Determina el plan de pago desde la suscripción de Stripe.
 * Orden: metadata.plan (checkout subscription_data) → priceId en .env → importe USD (unit_amount).
 */
function pickEpochSeconds(x: unknown): number {
  if (typeof x === 'number' && !Number.isNaN(x) && x > 0) return Math.floor(x);
  if (typeof x === 'string') {
    const n = parseInt(x, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/**
 * Lee un campo epoch (snake_case) de un Subscription de Stripe.
 * El SDK a veces no expone bien las claves vía `as Record` — usamos acceso tipado + JSON plano.
 */
/** Campos epoch en la respuesta de Stripe (snake_case en API; el SDK puede exponer camelCase). */
type StripeSubEpochFields = {
  current_period_end?: number;
  current_period_start?: number;
  currentPeriodEnd?: number;
  currentPeriodStart?: number;
  created?: number;
};

function readStripeSubscriptionEpochField(
  stripeSub: unknown,
  key: 'current_period_end' | 'current_period_start' | 'created',
): number {
  const s = stripeSub as StripeSubEpochFields;
  if (key === 'current_period_end') {
    const a = pickEpochSeconds(s.current_period_end ?? s.currentPeriodEnd);
    if (a > 0) return a;
  } else if (key === 'current_period_start') {
    const a = pickEpochSeconds(s.current_period_start ?? s.currentPeriodStart);
    if (a > 0) return a;
  } else {
    const a = pickEpochSeconds(s.created);
    if (a > 0) return a;
  }

  const o = stripeSub as Record<string, unknown>;
  let v = pickEpochSeconds(o[key]);
  if (v > 0) return v;

  const toJson = (stripeSub as { toJSON?: () => object }).toJSON;
  if (typeof toJson === 'function') {
    try {
      v = pickEpochSeconds((toJson.call(stripeSub) as Record<string, unknown>)[key]);
      if (v > 0) return v;
    } catch {
      /* ignore */
    }
  }

  try {
    const plain = JSON.parse(JSON.stringify(stripeSub)) as Record<string, unknown>;
    v = pickEpochSeconds(plain[key]);
    if (v > 0) return v;
    if (key === 'current_period_end') {
      v = pickEpochSeconds(plain.currentPeriodEnd);
      if (v > 0) return v;
    }
    if (key === 'current_period_start') {
      v = pickEpochSeconds(plain.currentPeriodStart);
      if (v > 0) return v;
    }
  } catch {
    /* ignore */
  }

  return 0;
}

/**
 * API Basil (p. ej. 2025-04-30.basil): `current_period_*` ya no están en Subscription,
 * solo en cada SubscriptionItem (`items.data[]`).
 * @see https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end
 */
function readPeriodFromSubscriptionItems(
  stripeSub: unknown,
  which: 'current_period_end' | 'current_period_start',
): number {
  const sub = stripeSub as {
    items?: { data?: Array<StripeSubEpochFields & Record<string, unknown>> };
  };
  const items = sub.items?.data;
  if (!items?.length) return 0;
  const camel = which === 'current_period_end' ? 'currentPeriodEnd' : 'currentPeriodStart';
  for (const raw of items) {
    const it = raw as Record<string, unknown>;
    let v = pickEpochSeconds(it[which]);
    if (v > 0) return v;
    v = pickEpochSeconds(it[camel]);
    if (v > 0) return v;
    try {
      const plain = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
      v = pickEpochSeconds(plain[which]);
      if (v > 0) return v;
      v = pickEpochSeconds(plain[camel]);
      if (v > 0) return v;
    } catch {
      /* ignore */
    }
  }
  return 0;
}

/** Lee `current_period_end` (segundos epoch): Subscription (API antigua) o primer SubscriptionItem (Basil). */
export function readCurrentPeriodEndSeconds(stripeSub: unknown): number {
  const top = readStripeSubscriptionEpochField(stripeSub, 'current_period_end');
  if (top > 0) return top;
  return readPeriodFromSubscriptionItems(stripeSub, 'current_period_end');
}

/** Lee `current_period_start` (segundos epoch): Subscription (API antigua) o primer SubscriptionItem (Basil). */
export function readCurrentPeriodStartSeconds(stripeSub: unknown): number {
  const top = readStripeSubscriptionEpochField(stripeSub, 'current_period_start');
  if (top > 0) return top;
  return readPeriodFromSubscriptionItems(stripeSub, 'current_period_start');
}

/** Stripe `subscription.created` (epoch segundos). */
export function readStripeSubscriptionCreatedSeconds(stripeSub: unknown): number {
  return readStripeSubscriptionEpochField(stripeSub, 'created');
}

/** Stripe Subscription.cancel_at_period_end */
export function readCancelAtPeriodEnd(stripeSub: unknown): boolean {
  const o = stripeSub as Record<string, unknown>;
  return o.cancel_at_period_end === true;
}

export function resolvePlanFromStripeSubscription(
  stripeSub: Stripe.Subscription | {
    metadata?: Record<string, string> | null;
    items?: Stripe.Subscription['items'];
  },
): string | null {
  const metaPlan = stripeSub.metadata?.plan;
  if (metaPlan && ['starter', 'growth', 'business', 'enterprise'].includes(metaPlan)) {
    return metaPlan;
  }

  const byPriceId = getPlanFromStripeSubscription(stripeSub as Stripe.Subscription);
  if (byPriceId) return byPriceId;

  const price = stripeSub.items?.data?.[0]?.price;
  const priceObj = typeof price === 'string' ? null : price;
  const cents = priceObj?.unit_amount;
  if (cents != null) {
    for (const [key, plan] of Object.entries(PLANS)) {
      if (plan.price * 100 === cents) return key;
    }
  }
  return null;
}

/**
 * Reconcile MongoDB with Stripe when we have customer/subscription IDs.
 * Fixes stale data if webhooks failed or `current_period_end` was missing.
 */
export async function syncSubscriptionFromStripe(userId: string) {
  if (!process.env.STRIPE_SECRET_KEY) return;

  await connectDB();
  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub) return;

  let subscriptionId = sub.stripeSubscriptionId;

  if (!subscriptionId && sub.stripeCustomerId) {
    const list = await stripe.subscriptions.list({
      customer: sub.stripeCustomerId,
      status: 'all',
      limit: 5,
    });
    const relevant = list.data.find((s) =>
      ['active', 'trialing', 'past_due', 'unpaid', 'paused'].includes(s.status),
    );
    if (relevant) {
      subscriptionId = relevant.id;
      sub.stripeSubscriptionId = relevant.id;
    }
  }

  if (!subscriptionId) return;

  try {
    // Stripe SDK typings wrap the resource; runtime shape includes current_period_end
    const stripeSub = (await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    })) as unknown as Stripe.Subscription;
    const mapped = mapStripeStatusToDb(stripeSub.status);
    const currentPeriodEnd = readCurrentPeriodEndSeconds(stripeSub);
    const currentPeriodStart = readCurrentPeriodStartSeconds(stripeSub);
    const stripeSubscriptionCreated = readStripeSubscriptionCreatedSeconds(stripeSub);
    const resolvedPlan = resolvePlanFromStripeSubscription(stripeSub);
    const customerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : (stripeSub.customer as Stripe.Customer)?.id;

    const update: Record<string, unknown> = {
      stripeSubscriptionId: stripeSub.id,
      status: mapped,
      currentPeriodEnd,
      currentPeriodStart,
      stripeSubscriptionCreated,
      cancelAtPeriodEnd: readCancelAtPeriodEnd(stripeSub),
    };
    if (customerId) update.stripeCustomerId = customerId;
    if (resolvedPlan) update.plan = resolvedPlan;

    await SubscriptionModel.findOneAndUpdate({ userId }, { $set: update });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Subscription] Stripe sync error:', msg);
  }
}

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
  await syncSubscriptionFromStripe(userId);

  const fresh = await SubscriptionModel.findOne({ userId });
  const doc = fresh || sub;
  const now = Date.now();
  const nowSec = now / 1000;

  const hasStripeSubscription = Boolean(doc.stripeSubscriptionId);
  const paidStripeStatuses = ['active', 'trialing', 'past_due'];
  const periodOk = doc.currentPeriodEnd > nowSec;
  const statusOk =
    paidStripeStatuses.includes(doc.status) ||
    (doc.status === 'incomplete' &&
      ['starter', 'growth', 'business', 'enterprise'].includes(doc.plan));
  const paidPlan = ['starter', 'growth', 'business', 'enterprise'].includes(doc.plan);
  // currentPeriodEnd en 0 en Mongo pero suscripción Stripe activa (SDK no extrajo el campo en webhook/sync)
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
    /** Hay `stripeSubscriptionId` en BD (suscripción en Stripe). */
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
