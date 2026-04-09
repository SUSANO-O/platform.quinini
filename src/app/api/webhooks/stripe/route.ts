/**
 * POST /api/webhooks/stripe
 * Handles Stripe events for subscription lifecycle management.
 */

import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { connectDB } from '@/lib/db/connection';
import { Subscription as SubscriptionModel, User } from '@/lib/db/models';
import {
  fetchInvoicePdfBuffer,
  sendPaidInvoiceEmail,
  sendSubscriptionEmail,
  type PaidInvoiceEmailKind,
} from '@/lib/email';
import {
  mapStripeStatusToDb,
  readCancelAtPeriodEnd,
  readCurrentPeriodEndSeconds,
  readCurrentPeriodStartSeconds,
  readStripeSubscriptionCreatedSeconds,
  resolvePlanFromStripeSubscription,
} from '@/lib/subscription';

/** Checkout puede devolver `subscription` como id o objeto expandido */
function sessionSubscriptionId(session: {
  subscription?: string | { id?: string } | null;
}): string | null {
  const s = session.subscription;
  if (typeof s === 'string') return s;
  if (s && typeof s === 'object' && typeof s.id === 'string') return s.id;
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') || '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  if (!webhookSecret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Webhook] Signature error:', msg);
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  await connectDB();

  try {
    switch (event.type) {

      // ── New subscription activated via Checkout ─────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as {
          metadata?: { userId?: string; plan?: string };
          customer?: string;
          subscription?: string;
          customer_details?: { email?: string };
        };
        const { userId, plan } = session.metadata || {};
        if (!userId) break;

        const stripeSubscriptionId = sessionSubscriptionId(session);
        const stripeCustomerId = typeof session.customer === 'string' ? session.customer : null;

        let currentPeriodEnd = 0;
        let currentPeriodStart = 0;
        let stripeSubscriptionCreated = 0;
        let resolvedPlan = plan || 'starter';
        if (stripeSubscriptionId) {
          const stripeSub = (await stripe.subscriptions.retrieve(stripeSubscriptionId, {
            expand: ['items.data.price'],
          })) as unknown as Stripe.Subscription;
          currentPeriodEnd = readCurrentPeriodEndSeconds(stripeSub);
          currentPeriodStart = readCurrentPeriodStartSeconds(stripeSub);
          stripeSubscriptionCreated = readStripeSubscriptionCreatedSeconds(stripeSub);
          const fromStripe = resolvePlanFromStripeSubscription(stripeSub);
          if (fromStripe) resolvedPlan = fromStripe;
        }

        await SubscriptionModel.findOneAndUpdate(
          { userId },
          {
            stripeCustomerId,
            stripeSubscriptionId,
            status: 'active',
            plan: resolvedPlan,
            currentPeriodEnd,
            currentPeriodStart,
            stripeSubscriptionCreated,
            cancelAtPeriodEnd: false,
          },
          { upsert: true, new: true },
        );

        // Correo con factura PDF: se envía en `invoice.paid` (evita duplicar sin adjunto).

        console.log(`[Webhook] Subscription activated — user:${userId} plan:${resolvedPlan}`);
        break;
      }

      // ── Subscription updated (renewal, plan change) ──────────────────────
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const stripeSub = event.data.object as Stripe.Subscription;
        const customerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : null;
        if (!customerId) break;

        const resolvedPlan = resolvePlanFromStripeSubscription(stripeSub);
        const periodEnd = readCurrentPeriodEndSeconds(stripeSub);
        const periodStart = readCurrentPeriodStartSeconds(stripeSub);
        const subCreated = readStripeSubscriptionCreatedSeconds(stripeSub);
        const mapped = mapStripeStatusToDb(stripeSub.status || 'active');

        const existing = await SubscriptionModel.findOne({ stripeCustomerId: customerId }).lean() as
          | { status?: string }
          | null;

        const update: Record<string, unknown> = {
          currentPeriodEnd: periodEnd,
          currentPeriodStart: periodStart,
          stripeSubscriptionCreated: subCreated,
          cancelAtPeriodEnd: readCancelAtPeriodEnd(stripeSub),
        };
        if (resolvedPlan) update.plan = resolvedPlan;

        // Evita condición de carrera: checkout.session.completed pone 'active' y luego
        // customer.subscription.created envía 'incomplete' y borraba el acceso en la UI.
        const wouldDowngradePaid =
          existing &&
          ['active', 'trialing'].includes(existing.status || '') &&
          mapped === 'incomplete';
        if (!wouldDowngradePaid) {
          update.status = mapped;
        }

        await SubscriptionModel.findOneAndUpdate({ stripeCustomerId: customerId }, update);
        console.log(
          `[Webhook] Subscription ${event.type} — customer:${customerId} status:${stripeSub.status} plan:${resolvedPlan ?? 'unchanged'} mapped:${mapped}${wouldDowngradePaid ? ' (status no degradado)' : ''}`,
        );
        break;
      }

      // ── Subscription canceled ─────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as { customer?: string };
        const customerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : null;
        if (!customerId) break;

        const sub = await SubscriptionModel.findOneAndUpdate(
          { stripeCustomerId: customerId },
          {
            status: 'canceled',
            currentPeriodEnd: 0,
            currentPeriodStart: 0,
            stripeSubscriptionCreated: 0,
            cancelAtPeriodEnd: false,
          },
          { new: true },
        );

        if (sub) {
          sendSubscriptionEmail(sub.userId, 'canceled', sub.plan).catch(() => {});
        }

        console.log(`[Webhook] Subscription canceled — customer:${customerId}`);
        break;
      }

      // ── Factura pagada (alta, cambio de plan con proration, renovación) ───
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
        };
        const customerId = typeof inv.customer === 'string' ? inv.customer : null;
        if (!customerId) break;

        const br = inv.billing_reason;
        const subRef = inv.subscription;
        const hasSubscription =
          subRef !== null &&
          subRef !== undefined &&
          (typeof subRef === 'string' || typeof subRef === 'object');
        if (!hasSubscription) break;

        const subDoc = await SubscriptionModel.findOne({ stripeCustomerId: customerId });
        let customerEmail: string | null = null;
        if (subDoc?.userId) {
          const u = await User.findById(subDoc.userId).lean() as { email?: string } | null;
          customerEmail = u?.email ?? null;
        }
        if (!customerEmail) {
          const cust = await stripe.customers.retrieve(customerId);
          if (typeof cust !== 'string' && !cust.deleted && cust.email) {
            customerEmail = cust.email;
          }
        }
        if (!customerEmail) {
          console.warn('[Webhook] invoice.paid — sin email para customer:', customerId);
          break;
        }

        const subId = typeof subRef === 'string' ? subRef : subRef?.id;
        let planLabel = 'tu plan';
        if (subId) {
          const stripeSub = await stripe.subscriptions.retrieve(subId, {
            expand: ['items.data.price'],
          });
          const p = resolvePlanFromStripeSubscription(stripeSub);
          if (p) {
            const names: Record<string, string> = {
              starter: 'Starter ($19/mes)',
              growth: 'Growth ($49/mes)',
              business: 'Business ($129/mes)',
              enterprise: 'Enterprise',
            };
            planLabel = names[p] || p;
          }
        }

        let pdfBuffer: Buffer | null = null;
        if (inv.invoice_pdf) {
          pdfBuffer = await fetchInvoicePdfBuffer(inv.invoice_pdf);
        } else {
          const full = await stripe.invoices.retrieve(inv.id);
          if (full.invoice_pdf) pdfBuffer = await fetchInvoicePdfBuffer(full.invoice_pdf);
        }

        const amountCents = inv.amount_paid ?? inv.amount_due ?? 0;
        const cur = (inv.currency || 'usd').toUpperCase();
        const amountFormatted = new Intl.NumberFormat('es', {
          style: 'currency',
          currency: cur,
        }).format(amountCents / 100);

        let kind: PaidInvoiceEmailKind = 'other';
        if (br === 'subscription_create') kind = 'first_payment';
        else if (br === 'subscription_update') kind = 'plan_change';
        else if (br === 'subscription_cycle' || br === 'subscription_threshold') kind = 'renewal';

        sendPaidInvoiceEmail(customerEmail, {
          kind,
          planLabel,
          amountFormatted,
          invoiceNumber: inv.number ?? null,
          hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
          pdfBuffer,
        }).catch(() => {});

        console.log(`[Webhook] invoice.paid — customer:${customerId} invoice:${inv.id} kind:${kind}`);
        break;
      }

      // ── Payment failed ─────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as {
          customer?: string;
          attempt_count?: number;
          next_payment_attempt?: number | null;
        };
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
        if (!customerId) break;

        // After 3 failed attempts Stripe cancels the subscription automatically.
        // We mark as past_due immediately on first failure.
        const sub = await SubscriptionModel.findOneAndUpdate(
          { stripeCustomerId: customerId },
          { status: 'past_due' },
          { new: true },
        );

        if (sub) {
          sendSubscriptionEmail(sub.userId, 'payment_failed', sub.plan).catch(() => {});
        }

        console.log(`[Webhook] Payment failed — customer:${customerId} attempt:${invoice.attempt_count}`);
        break;
      }

      // ── Trial ending soon (3 days warning) ────────────────────────────────
      case 'customer.subscription.trial_will_end': {
        const stripeSub = event.data.object as { customer?: string; trial_end?: number };
        const customerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : null;
        if (!customerId) break;

        const sub = await SubscriptionModel.findOne({ stripeCustomerId: customerId });
        if (sub) {
          sendSubscriptionEmail(sub.userId, 'trial_ending', sub.plan).catch(() => {});
        }

        console.log(`[Webhook] Trial ending soon — customer:${customerId}`);
        break;
      }

      default:
        break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Webhook] Handler error:', msg);
    // Return 200 to prevent Stripe from retrying — the error is on our side
  }

  return NextResponse.json({ received: true });
}
