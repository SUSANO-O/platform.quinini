/**
 * Suscripción: primer checkout, cambio de plan con proration (Stripe subscriptions.update),
 * y helpers para portal / cancelación.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe, PLANS } from '@/lib/stripe';
import { verifySessionToken, isUserEmailVerified, isImpersonationSession } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Subscription as SubscriptionModel, User } from '@/lib/db/models';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  readCancelAtPeriodEnd,
  readCurrentPeriodEndSeconds,
  syncSubscriptionFromStripe,
} from '@/lib/subscription';

const PAID_STRIPE_STATUSES = new Set(['active', 'trialing', 'past_due']);

function planKey(plan: string): plan is keyof typeof PLANS {
  return plan in PLANS;
}

async function getOrCreateStripeCustomerId(userId: string, email: string): Promise<string> {
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length > 0) return customers.data[0].id;
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  return customer.id;
}

/**
 * Cambia el price de la suscripción existente con proration estándar de Stripe.
 */
export async function changeStripeSubscriptionPlan(params: {
  stripeSubscriptionId: string;
  newPriceId: string;
  userId: string;
  planLabel: string;
}): Promise<void> {
  const { stripeSubscriptionId, newPriceId, userId, planLabel } = params;

  const stripeSub = (await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ['items.data.price'],
  })) as Stripe.Subscription;

  const item = stripeSub.items.data[0];
  if (!item?.id) {
    throw new Error('La suscripción no tiene ítems de facturación.');
  }

  const currentPriceId = typeof item.price === 'string' ? item.price : item.price?.id;
  if (currentPriceId === newPriceId) {
    throw new Error('Ya tienes este plan.');
  }

  const meta = { ...(stripeSub.metadata || {}), userId, plan: planLabel };

  await stripe.subscriptions.update(stripeSubscriptionId, {
    items: [{ id: item.id, price: newPriceId }],
    proration_behavior: 'create_prorations',
    metadata: meta,
  });
}

/**
 * POST cuerpo { plan }. Si ya hay suscripción de pago en Stripe → update con proration;
 * si no → sesión de Checkout (nuevo pago).
 */
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
    if (!planKey(plan)) {
      return NextResponse.json({ error: 'Plan no válido.' }, { status: 400 });
    }

    const planConfig = PLANS[plan];
    if (!planConfig.priceId) {
      return NextResponse.json(
        { error: 'Plan no configurado (falta STRIPE_PRICE_*).' },
        { status: 400 },
      );
    }

    await connectDB();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

    if (!isImpersonationSession(req.cookies) && !isUserEmailVerified(user)) {
      return NextResponse.json(
        {
          error: 'Debes verificar tu correo antes de contratar o cambiar de plan.',
          code: 'EMAIL_NOT_VERIFIED',
        },
        { status: 403 },
      );
    }

    const subDoc = await SubscriptionModel.findOne({ userId });
    const stripeSubId = subDoc?.stripeSubscriptionId;

    if (stripeSubId) {
      let stripeSub: Stripe.Subscription;
      try {
        stripeSub = (await stripe.subscriptions.retrieve(stripeSubId, {
          expand: ['items.data.price'],
        })) as Stripe.Subscription;
      } catch {
        await SubscriptionModel.findOneAndUpdate({ userId }, { $unset: { stripeSubscriptionId: 1 } });
        return await createCheckoutResponse(req, userId, user.email, plan, planConfig.priceId);
      }

      if (PAID_STRIPE_STATUSES.has(stripeSub.status)) {
        try {
          await changeStripeSubscriptionPlan({
            stripeSubscriptionId: stripeSub.id,
            newPriceId: planConfig.priceId,
            userId,
            planLabel: plan,
          });
          await syncSubscriptionFromStripe(userId);
          return NextResponse.json({
            ok: true,
            proration: true,
            message:
              'Plan actualizado. Stripe aplicará el prorateo en la próxima factura (ajuste proporcional).',
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
  const customerId = await getOrCreateStripeCustomerId(userId, email);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?subscription=success`,
    cancel_url: `${appUrl}/dashboard?subscription=cancelled`,
    metadata: { userId, plan },
    subscription_data: {
      metadata: { userId, plan },
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: 'No se pudo crear la sesión de pago.' }, { status: 500 });
  }

  return NextResponse.json({ url: session.url, ok: false });
}

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
  let customerId = sub?.stripeCustomerId;
  if (!customerId) {
    customerId = await getOrCreateStripeCustomerId(userId, user.email);
    await SubscriptionModel.findOneAndUpdate({ userId }, { $set: { stripeCustomerId: customerId } });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/dashboard/settings?billing=return`,
    });
    if (!portal.url) {
      return NextResponse.json({ error: 'Portal no disponible.' }, { status: 500 });
    }
    return NextResponse.json({ url: portal.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] portal:', msg);
    return NextResponse.json(
      {
        error:
          'No se pudo abrir el portal de facturación. Configura el Customer Portal en Stripe Dashboard (Billing → Customer portal).',
      },
      { status: 502 },
    );
  }
}

/** Body: { atPeriodEnd: boolean } — true = cancelar al final del periodo (recomendado); false = cancelación inmediata. */
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
  } catch {
    /* default */
  }

  await connectDB();
  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub?.stripeSubscriptionId) {
    return NextResponse.json({ error: 'No hay suscripción de pago asociada.' }, { status: 400 });
  }

  try {
    if (atPeriodEnd) {
      const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      await SubscriptionModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            cancelAtPeriodEnd: readCancelAtPeriodEnd(updated),
            currentPeriodEnd: readCurrentPeriodEndSeconds(updated) || sub.currentPeriodEnd,
          },
        },
      );
      return NextResponse.json({
        ok: true,
        atPeriodEnd: true,
        message: 'La suscripción se cancelará al final del periodo de facturación actual. Seguirás con acceso hasta esa fecha.',
      });
    }

    await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    await SubscriptionModel.findOneAndUpdate(
      { userId },
      { $set: { status: 'canceled', currentPeriodEnd: 0, cancelAtPeriodEnd: false } },
    );
    return NextResponse.json({
      ok: true,
      atPeriodEnd: false,
      message: 'Suscripción cancelada de inmediato.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] cancel:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Quita la cancelación programada (misma suscripción, sin nuevo cobro). */
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
  if (!sub?.stripeSubscriptionId) {
    return NextResponse.json({ error: 'No hay suscripción de pago asociada.' }, { status: 400 });
  }

  try {
    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
    await SubscriptionModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          cancelAtPeriodEnd: readCancelAtPeriodEnd(updated),
          currentPeriodEnd: readCurrentPeriodEndSeconds(updated) || sub.currentPeriodEnd,
        },
      },
    );
    return NextResponse.json({
      ok: true,
      message: 'Cancelación anulada. Tu suscripción continuará renovándose.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] resume:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** SetupIntent para actualizar tarjeta sin salir de la app (Stripe Elements). */
export async function postCreateSetupIntent(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const rl = checkRateLimit('billing-setup-intent', ip, 20, 60 * 60 * 1000);
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
      {
        error: 'Verifica tu correo antes de actualizar el método de pago.',
        code: 'EMAIL_NOT_VERIFIED',
      },
      { status: 403 },
    );
  }

  let sub = await SubscriptionModel.findOne({ userId });
  let customerId = sub?.stripeCustomerId;
  if (!customerId) {
    customerId = await getOrCreateStripeCustomerId(userId, user.email);
    await SubscriptionModel.findOneAndUpdate(
      { userId },
      { $set: { stripeCustomerId: customerId } },
      { upsert: true, new: true },
    );
  }

  try {
    const si = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { userId },
    });
    if (!si.client_secret) {
      return NextResponse.json({ error: 'No se pudo iniciar el guardado de tarjeta.' }, { status: 500 });
    }
    return NextResponse.json({ clientSecret: si.client_secret });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] setup-intent:', msg);
    return NextResponse.json({ error: 'Error al crear SetupIntent.' }, { status: 500 });
  }
}

/** Tras confirmSetup en el cliente: fija método por defecto en cliente y suscripción. */
export async function postCompleteSetupIntent(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const rl = checkRateLimit('billing-setup-complete', ip, 30, 60 * 60 * 1000);
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

  let setupIntentId = '';
  try {
    const body = await req.json();
    setupIntentId = typeof body?.setupIntentId === 'string' ? body.setupIntentId : '';
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  if (!setupIntentId) {
    return NextResponse.json({ error: 'Falta setupIntentId.' }, { status: 400 });
  }

  await connectDB();
  const user = await User.findById(userId).select('emailVerified').lean() as
    | { emailVerified?: boolean | null }
    | null;
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
  if (!isImpersonationSession(req.cookies) && !isUserEmailVerified(user)) {
    return NextResponse.json(
      {
        error: 'Verifica tu correo antes de guardar un método de pago.',
        code: 'EMAIL_NOT_VERIFIED',
      },
      { status: 403 },
    );
  }

  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ error: 'No hay cliente de facturación.' }, { status: 400 });
  }

  try {
    const si = await stripe.setupIntents.retrieve(setupIntentId);
    if (si.status !== 'succeeded') {
      return NextResponse.json(
        { error: 'El método de pago no se completó. Intenta de nuevo.' },
        { status: 400 },
      );
    }
    if (si.metadata?.userId !== userId) {
      return NextResponse.json({ error: 'Operación no permitida.' }, { status: 403 });
    }
    const cid = typeof si.customer === 'string' ? si.customer : si.customer?.id;
    if (!cid || cid !== sub.stripeCustomerId) {
      return NextResponse.json({ error: 'Cliente no coincide.' }, { status: 403 });
    }
    const pmId =
      typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id;
    if (!pmId) {
      return NextResponse.json({ error: 'Sin método de pago.' }, { status: 400 });
    }

    await stripe.customers.update(cid, {
      invoice_settings: { default_payment_method: pmId },
    });
    if (sub.stripeSubscriptionId) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        default_payment_method: pmId,
      });
    }
    await syncSubscriptionFromStripe(userId);
    return NextResponse.json({ ok: true, message: 'Método de pago actualizado correctamente.' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] complete setup:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function getBillingInvoices(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();
  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ invoices: [] });
  }

  try {
    const list = await stripe.invoices.list({
      customer: sub.stripeCustomerId,
      limit: 36,
    });
    const invoices = list.data.map((inv) => ({
      id: inv.id,
      number: inv.number ?? inv.id,
      status: inv.status,
      amountDue: inv.amount_due,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      created: inv.created,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdf: inv.invoice_pdf,
    }));
    return NextResponse.json({ invoices });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] invoices:', msg);
    return NextResponse.json({ error: 'No se pudieron cargar las facturas.' }, { status: 500 });
  }
}
