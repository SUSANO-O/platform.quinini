/**
 * ─── STRIPE WEBHOOK (comentado — migrado a Paddle) ─────────────────────────
 * El nuevo webhook activo está en:  /api/webhooks/paddle/route.ts
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Para re-activar Stripe: descomentar todo el código de abajo, instalar
 * de nuevo el paquete `stripe` y configurar STRIPE_WEBHOOK_SECRET.
 */

// import Stripe from 'stripe';
// import { NextRequest, NextResponse } from 'next/server';
// import { stripe } from '@/lib/stripe';
// import { connectDB } from '@/lib/db/connection';
// import { Subscription as SubscriptionModel, User, ConversationPack } from '@/lib/db/models';
// import { fetchInvoicePdfBuffer, sendPaidInvoiceEmail, sendSubscriptionEmail } from '@/lib/email';
// import {
//   mapStripeStatusToDb, readCancelAtPeriodEnd, readCurrentPeriodEndSeconds,
//   readCurrentPeriodStartSeconds, readStripeSubscriptionCreatedSeconds,
//   resolvePlanFromStripeSubscription,
// } from '@/lib/subscription';
//
// function sessionSubscriptionId(session: { subscription?: string | { id?: string } | null }): string | null { ... }
//
// export async function POST(req: NextRequest) {
//   const body = await req.text();
//   const sig = req.headers.get('stripe-signature') || '';
//   const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
//   ...
//   switch (event.type) {
//     case 'checkout.session.completed': { ... }
//     case 'customer.subscription.updated':
//     case 'customer.subscription.created': { ... }
//     case 'customer.subscription.deleted': { ... }
//     case 'invoice.paid': { ... }
//     case 'invoice.payment_failed': { ... }
//     case 'customer.subscription.trial_will_end': { ... }
//   }
//   return NextResponse.json({ received: true });
// }
//
// → Ver git history para la implementación completa.

export {};
