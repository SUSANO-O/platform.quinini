/**
 * Operaciones de facturación: checkout, cambio de plan, portal, cancelación.
 * Migrado de Paddle a LemonSqueezy.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { PLANS } from '@/lib/lemonsqueezy';
import { getPaymentService } from '@/lib/payment';
import { verifySessionToken, isUserEmailVerified, isImpersonationSession } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Subscription as SubscriptionModel, User } from '@/lib/db/models';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { syncSubscriptionFromLS } from '@/lib/subscription';

const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

function planKey(plan: string): plan is keyof typeof PLANS {
  return plan in PLANS;
}

// ─────────────────────────────────────────────────────────────────────────────
// changeSubscriptionPlan — delega al PaymentService (Paddle)
// ─────────────────────────────────────────────────────────────────────────────

export async function changeSubscriptionPlan(params: {
  subscriptionId: string;
  newPriceId: string;
  userId: string;
  planLabel: string;
}): Promise<void> {
  const paymentService = getPaymentService();
  await paymentService.changeSubscriptionPlan(params);
}

// Alias para compatibilidad con código que usaba el nombre Stripe
export const changeStripeSubscriptionPlan = changeSubscriptionPlan;

// ─────────────────────────────────────────────────────────────────────────────
// postSubscribePlan — nuevo plan o cambio con prorrateo
// ─────────────────────────────────────────────────────────────────────────────

export async function postSubscribePlan(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const rl = checkRateLimit('billing-plan', ip, 15, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  try {
    const { plan = 'starter' } = await req.json();
    if (!planKey(plan)) return NextResponse.json({ error: 'Plan no válido.' }, { status: 400 });

    const planConfig = PLANS[plan];
    if (!planConfig.priceId) {
      return NextResponse.json(
        { error: 'Plan no configurado (falta LEMONSQUEEZY_VARIANT_*).' },
        { status: 400 },
      );
    }

    await connectDB();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

    if (!isImpersonationSession(req.cookies) && !isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: 'Debes verificar tu correo antes de contratar o cambiar de plan.', code: 'EMAIL_NOT_VERIFIED' },
        { status: 403 },
      );
    }

    const subDoc = await SubscriptionModel.findOne({ userId });
    const lsSubId = subDoc?.lsSubscriptionId;

    if (lsSubId && PAID_STATUSES.has(subDoc?.status ?? '')) {
      try {
        await changeSubscriptionPlan({
          subscriptionId: lsSubId,
          newPriceId: planConfig.priceId,
          userId,
          planLabel: plan,
        });
        await syncSubscriptionFromLS(userId);
        return NextResponse.json({
          ok: true,
          proration: true,
          message: 'Plan actualizado. LemonSqueezy aplicará el prorrateo en la próxima factura.',
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error al cambiar plan.';
        if (msg.includes('Ya tienes este plan')) {
          return NextResponse.json({ error: msg }, { status: 400 });
        }
        console.error('[Billing] change plan:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    return await createCheckoutResponse(req, userId, user.email, plan, planConfig.priceId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Billing] subscribe:', msg);
    return NextResponse.json({ error: 'Error al procesar la suscripción.' }, { status: 500 });
  }
}

async function createCheckoutResponse(
  req: NextRequest,
  userId: string,
  email: string,
  plan: string,
  priceId: string,
): Promise<NextResponse> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const paymentService = getPaymentService();

  try {
    // Persistimos paddleCustomerId antes del checkout para poder reconciliar
    // webhooks aunque custom_data.userId no llegue en algunos eventos.
    const customerId = await paymentService.getOrCreateCustomerId(userId, email);
    await SubscriptionModel.findOneAndUpdate(
      { userId },
      { $set: { lsCustomerId: customerId } },
      { upsert: true, new: true },
    );

    const { url } = await paymentService.createCheckoutSession({
      userId,
      email,
      plan,
      priceId,
      successUrl: `${appUrl}/dashboard?subscription=success`,
      cancelUrl: `${appUrl}/dashboard?subscription=cancelled`,
    });
    return NextResponse.json({ url, ok: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] checkout:', msg);
    return NextResponse.json({ error: 'No se pudo crear la sesión de pago.' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// postBillingPortal — Customer Portal de LemonSqueezy
// ─────────────────────────────────────────────────────────────────────────────

export async function postBillingPortal(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const rl = checkRateLimit('billing-portal', ip, 10, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  const sub = await SubscriptionModel.findOne({ userId });
  let customerId = sub?.lsCustomerId as string | undefined;

  if (!customerId) {
    const paymentService = getPaymentService();
    customerId = await paymentService.getOrCreateCustomerId(userId, user.email);
    if (customerId) {
      await SubscriptionModel.findOneAndUpdate({ userId }, { $set: { lsCustomerId: customerId } });
    }
  }

  if (!customerId) {
    return NextResponse.json(
      { error: 'No hay suscripción activa para acceder al portal.' },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  try {
    const paymentService = getPaymentService();
    const url = await paymentService.getBillingPortalUrl(
      customerId,
      `${appUrl}/dashboard/settings?billing=return`,
    );
    return NextResponse.json({ url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] portal:', msg);
    return NextResponse.json(
      { error: 'No se pudo abrir el portal de facturación.' },
      { status: 502 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// postCancelSubscription
// ─────────────────────────────────────────────────────────────────────────────

export async function postCancelSubscription(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const rl = checkRateLimit('billing-cancel', ip, 8, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  let atPeriodEnd = true;
  try {
    const body = await req.json();
    if (typeof body?.atPeriodEnd === 'boolean') atPeriodEnd = body.atPeriodEnd;
  } catch { /* default */ }

  await connectDB();
  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub?.lsSubscriptionId) {
    return NextResponse.json({ error: 'No hay suscripción de pago asociada.' }, { status: 400 });
  }

  try {
    const paymentService = getPaymentService();
    await paymentService.cancelSubscription(sub.lsSubscriptionId, atPeriodEnd);

    // LS siempre cancela al fin del período; sincronizamos para reflejar cancelAtPeriodEnd
    await syncSubscriptionFromLS(userId);
    return NextResponse.json({
      ok: true,
      atPeriodEnd: true,
      message: 'La suscripción se cancelará al final del periodo de facturación actual.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] cancel:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// postResumeSubscription
// ─────────────────────────────────────────────────────────────────────────────

export async function postResumeSubscription(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const rl = checkRateLimit('billing-resume', ip, 10, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();
  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub?.lsSubscriptionId) {
    return NextResponse.json({ error: 'No hay suscripción de pago asociada.' }, { status: 400 });
  }

  try {
    const paymentService = getPaymentService();
    await paymentService.resumeSubscription(sub.lsSubscriptionId);
    await syncSubscriptionFromLS(userId);
    return NextResponse.json({ ok: true, message: 'Cancelación anulada. Tu suscripción continuará renovándose.' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] resume:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// postGetPaymentMethodUrl — URL de Paddle para actualizar la tarjeta
// Reemplaza el flujo SetupIntent de Stripe.
// ─────────────────────────────────────────────────────────────────────────────

export async function postGetPaymentMethodUrl(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const rl = checkRateLimit('billing-pm-url', ip, 20, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  if (!isImpersonationSession(req.cookies) && !isUserEmailVerified(user)) {
    return NextResponse.json(
      { error: 'Verifica tu correo antes de actualizar el método de pago.', code: 'EMAIL_NOT_VERIFIED' },
      { status: 403 },
    );
  }

  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub?.lsSubscriptionId) {
    return NextResponse.json({ error: 'No hay suscripción de pago activa.' }, { status: 400 });
  }

  try {
    const paymentService = getPaymentService();
    const url = await paymentService.getPaymentMethodUpdateUrl(sub.lsSubscriptionId);
    return NextResponse.json({ url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] payment-method-url:', msg);
    return NextResponse.json({ error: 'No se pudo obtener la URL de actualización de pago.' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// postCreateSetupIntent / postCompleteSetupIntent — Stripe (comentados)
// Reemplazados por postGetPaymentMethodUrl (Paddle redirect)
// ─────────────────────────────────────────────────────────────────────────────

// export async function postCreateSetupIntent(req: NextRequest): Promise<NextResponse> { ... }
// export async function postCompleteSetupIntent(req: NextRequest): Promise<NextResponse> { ... }
// → Ver git history para la implementación completa de Stripe SetupIntent.

// ─────────────────────────────────────────────────────────────────────────────
// getBillingInvoices
// ─────────────────────────────────────────────────────────────────────────────

export async function getBillingInvoices(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();
  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub?.lsCustomerId) {
    return NextResponse.json({ invoices: [] });
  }

  try {
    const paymentService = getPaymentService();
    const invoices = await paymentService.getInvoices(sub.lsCustomerId);
    return NextResponse.json({ invoices });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] invoices:', msg);
    return NextResponse.json({ error: 'No se pudieron cargar las facturas.' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── STRIPE (comentado — conservado para referencia) ─────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//
// import type Stripe from 'stripe';
// import { stripe, PLANS } from '@/lib/stripe';
//
// async function getOrCreateStripeCustomerId(userId: string, email: string): Promise<string> {
//   const customers = await stripe.customers.list({ email, limit: 1 });
//   if (customers.data.length > 0) return customers.data[0].id;
//   const customer = await stripe.customers.create({ email, metadata: { userId } });
//   return customer.id;
// }
//
// export async function changeStripeSubscriptionPlan(...) { ... }
// export async function postSubscribePlan(...) { stripe.checkout.sessions.create(...) }
// export async function postBillingPortal(...) { stripe.billingPortal.sessions.create(...) }
// export async function postCancelSubscription(...) { stripe.subscriptions.update/cancel(...) }
// export async function postResumeSubscription(...) { stripe.subscriptions.update(...) }
// export async function postCreateSetupIntent(...) { stripe.setupIntents.create(...) }
// export async function postCompleteSetupIntent(...) { stripe.setupIntents.retrieve(...) }
// export async function getBillingInvoices(...) { stripe.invoices.list(...) }
// → Ver git history para las implementaciones completas de Stripe.
