/**
 * POST /api/webhooks/paddle
 * Maneja eventos de Paddle Billing v2 para la gestión del ciclo de vida
 * de suscripciones y pagos únicos (conversation packs).
 *
 * Equivalente migrado de /api/webhooks/stripe
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { EventName } from '@paddle/paddle-node-sdk';
import { connectDB } from '@/lib/db/connection';
import { Subscription as SubscriptionModel, User, ConversationPack } from '@/lib/db/models';
import {
  sendPaidInvoiceEmail,
  sendSubscriptionEmail,
  type PaidInvoiceEmailKind,
} from '@/lib/email';
import {
  mapPaddleStatusToDb,
  resolvePlanFromPaddleSubscription,
  readCancelAtPeriodEnd,
  readCurrentPeriodEndSeconds,
  readCurrentPeriodStartSeconds,
  readSubscriptionCreatedSeconds,
} from '@/lib/subscription';

// ─── Tipos internos mínimos ────────────────────────────────────────────────

// Paddle envía snake_case en el JSON del webhook
type PaddleTransaction = {
  id: string;
  customer_id?: string | null;
  subscription_id?: string | null;
  status?: string;
  origin?: string;
  currency_code?: string;
  billing_period?: { starts_at?: string; ends_at?: string } | null;
  details?: { totals?: { total?: string } };
  invoice_number?: string | null;
  custom_data?: Record<string, string | undefined> | null;
};

type PaddleSubscription = {
  id: string;
  customer_id?: string | null;
  status?: string;
  current_billing_period?: { starts_at?: string; ends_at?: string } | null;
  items?: Array<{
    price?: { id?: string; unit_price?: { amount?: string } };
    current_billing_period?: { starts_at?: string; ends_at?: string };
  }>;
  scheduled_change?: { action?: string } | null;
  custom_data?: Record<string, string | undefined> | null;
  created_at?: string;
};

// ─── Helper ────────────────────────────────────────────────────────────────

function isoToEpoch(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

// ─── Handler principal ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('paddle-signature') || '';
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET || '';

  if (!webhookSecret) {
    console.error('[Webhook/Paddle] PADDLE_WEBHOOK_SECRET no configurado');
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 });
  }

  // Verificación HMAC manual — más robusta que paddle.webhooks.unmarshal
  // Formato: Paddle-Signature: ts={epoch};h1={hex_hmac_sha256}
  // HMAC se computa sobre: "{ts}:{rawBody}"
  try {
    const parts = Object.fromEntries(signature.split(';').map((p) => p.split('=')));
    const ts = parts['ts'];
    const h1 = parts['h1'];
    if (!ts || !h1) throw new Error('Firma incompleta');
    const expected = createHmac('sha256', webhookSecret).update(`${ts}:${body}`).digest('hex');
    if (!timingSafeEqual(Buffer.from(h1, 'hex'), Buffer.from(expected, 'hex'))) {
      throw new Error('Firma no coincide');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Webhook/Paddle] Error de firma:', msg);
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  let event: { eventType: string; data: unknown };
  try {
    const parsed = JSON.parse(body) as { event_type: string; data: unknown };
    event = { eventType: parsed.event_type, data: parsed.data };
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  await connectDB();

  try {
    switch (event.eventType) {

      // ── Checkout completado (suscripción nueva o pack) ─────────────────
      case EventName.TransactionCompleted: {
        const txn = event.data as unknown as PaddleTransaction;
        const { userId, plan, type, packId, conversations } = txn.custom_data ?? {};

        // ── Pack de conversaciones (compra única) ────────────────────────
        const KNOWN_PACK_IDS = new Set(['pack_s', 'pack_m', 'pack_l']);
        if (type === 'conversation_pack' && userId && packId && conversations) {
          if (!KNOWN_PACK_IDS.has(packId)) {
            console.error(`[Webhook/Paddle] packId desconocido: "${packId}" — txn:${txn.id}`);
            break;
          }
          const convCount = parseInt(conversations, 10);
          if (!isNaN(convCount) && convCount > 0) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 90);
            try {
              await ConversationPack.create({
                userId,
                packId,
                conversations: convCount,
                used: 0,
                stripeSessionId: txn.id, // reutilizamos el campo para el ID de transacción Paddle
                expiresAt,
                status: 'active',
              });
              console.log(`[Webhook/Paddle] Pack acreditado — user:${userId} pack:${packId} conv:${convCount}`);
            } catch (err: unknown) {
              const code = err && typeof err === 'object' && 'code' in err ? (err as { code: unknown }).code : null;
              if (code === 11000) {
                console.log(`[Webhook/Paddle] Pack ya acreditado (idempotente) — txn:${txn.id}`);
              } else {
                throw err;
              }
            }
          }
          break;
        }

        // ── Nueva suscripción via checkout ─────────────────────────────
        if (!txn.subscription_id) {
          console.warn(`[Webhook/Paddle] transaction.completed sin subscription_id — txn:${txn.id}`);
          break;
        }

        let resolvedUserId = userId ?? null;
        if (!resolvedUserId && txn.customer_id) {
          const known = await SubscriptionModel.findOne({ paddleCustomerId: txn.customer_id }).lean() as { userId?: string } | null;
          if (known?.userId) resolvedUserId = known.userId;
        }
        if (!resolvedUserId) {
          console.warn(
            `[Webhook/Paddle] transaction.completed sin userId resoluble — txn:${txn.id} customer:${txn.customer_id ?? 'n/a'}`,
          );
          break;
        }

        const periodEnd = isoToEpoch(txn.billing_period?.ends_at);
        const periodStart = isoToEpoch(txn.billing_period?.starts_at);
        const resolvedPlan = plan || 'starter';

        await SubscriptionModel.findOneAndUpdate(
          { userId: resolvedUserId },
          {
            paddleCustomerId: txn.customer_id || null,
            paddleSubscriptionId: txn.subscription_id,
            status: 'active',
            plan: resolvedPlan,
            currentPeriodEnd: periodEnd,
            currentPeriodStart: periodStart,
            cancelAtPeriodEnd: false,
          },
          { upsert: true, new: true },
        );

        console.log(`[Webhook/Paddle] Suscripción activada — user:${resolvedUserId} plan:${resolvedPlan}`);
        break;
      }

      // ── Suscripción creada / actualizada ──────────────────────────────
      case EventName.SubscriptionCreated:
      case EventName.SubscriptionUpdated: {
        const paddleSub = event.data as unknown as PaddleSubscription;
        const customerId = paddleSub.customer_id;
        if (!customerId) break;

        const resolvedPlan = resolvePlanFromPaddleSubscription(paddleSub);
        const periodEnd = readCurrentPeriodEndSeconds(paddleSub);
        const periodStart = readCurrentPeriodStartSeconds(paddleSub);
        const subCreated = readSubscriptionCreatedSeconds(paddleSub);
        const mapped = mapPaddleStatusToDb(paddleSub.status);
        const cancelAtEnd = readCancelAtPeriodEnd(paddleSub);

        const baseUpdate: Record<string, unknown> = {
          currentPeriodEnd: periodEnd,
          currentPeriodStart: periodStart,
          stripeSubscriptionCreated: subCreated,
          cancelAtPeriodEnd: cancelAtEnd,
          paddleSubscriptionId: paddleSub.id,
        };
        if (resolvedPlan) baseUpdate.plan = resolvedPlan;

        // Actualización atómica con manejo de condición de carrera:
        // no sobreescribir 'active'/'trialing' con 'incomplete'
        await SubscriptionModel.findOneAndUpdate({ paddleCustomerId: customerId }, { $set: baseUpdate });
        if (mapped === 'incomplete') {
          await SubscriptionModel.findOneAndUpdate(
            { paddleCustomerId: customerId, status: { $nin: ['active', 'trialing'] } },
            { $set: { status: mapped } },
          );
        } else {
          await SubscriptionModel.findOneAndUpdate(
            { paddleCustomerId: customerId },
            { $set: { status: mapped } },
          );
        }

        console.log(
          `[Webhook/Paddle] Suscripción ${event.eventType} — customer:${customerId} status:${paddleSub.status} plan:${resolvedPlan ?? 'unchanged'}`,
        );
        break;
      }

      // ── Suscripción cancelada ────────────────────────────────────────
      case EventName.SubscriptionCanceled: {
        const paddleSub = event.data as unknown as PaddleSubscription;
        const customerId = paddleSub.customer_id;
        if (!customerId) break;

        const sub = await SubscriptionModel.findOneAndUpdate(
          { paddleCustomerId: customerId },
          { status: 'canceled', currentPeriodEnd: 0, currentPeriodStart: 0, cancelAtPeriodEnd: false },
          { new: true },
        );

        if (sub) {
          sendSubscriptionEmail(sub.userId, 'canceled', sub.plan).catch((e) =>
            console.error('[Webhook/Paddle] canceled email:', e),
          );
        }

        console.log(`[Webhook/Paddle] Suscripción cancelada — customer:${customerId}`);
        break;
      }

      // ── Pago completado (factura) ─────────────────────────────────────
      case EventName.TransactionBilled: {
        const txn = event.data as unknown as PaddleTransaction;
        const customerId = txn.customer_id;
        if (!customerId || !txn.subscription_id) break;

        const subDoc = await SubscriptionModel.findOne({ paddleCustomerId: customerId });
        let customerEmail: string | null = null;
        if (subDoc?.userId) {
          const u = await User.findById(subDoc.userId).lean() as { email?: string } | null;
          customerEmail = u?.email ?? null;
        }
        if (!customerEmail) {
          console.warn('[Webhook/Paddle] transaction.billed — sin email para customer:', customerId);
          break;
        }

        const amountStr = txn.details?.totals?.total ?? '0';
        const amountCents = parseInt(amountStr, 10);
        const cur = (txn.currency_code || 'USD').toUpperCase();
        const amountFormatted = new Intl.NumberFormat('es', {
          style: 'currency',
          currency: cur,
        }).format(amountCents / 100);

        let kind: PaidInvoiceEmailKind = 'other';
        if (txn.origin === 'subscription_charge' && !txn.billing_period) kind = 'first_payment';
        else if (txn.origin === 'subscription_update') kind = 'plan_change';
        else if (txn.origin === 'subscription_charge') kind = 'renewal';

        const planLabel = subDoc?.plan
          ? (({ starter: 'Starter ($29/mes)', growth: 'Growth ($79/mes)', business: 'Business ($199/mes)', enterprise: 'Enterprise' } as Record<string, string>)[subDoc.plan] ?? subDoc.plan)
          : 'tu plan';

        sendPaidInvoiceEmail(customerEmail, {
          kind,
          planLabel,
          amountFormatted,
          invoiceNumber: txn.invoice_number ?? null,
          hostedInvoiceUrl: null,
          pdfBuffer: null,
        }).catch((e) => console.error('[Webhook/Paddle] invoice email:', e));

        console.log(`[Webhook/Paddle] transaction.billed — customer:${customerId} txn:${txn.id} kind:${kind}`);
        break;
      }

      // ── Pago fallido ─────────────────────────────────────────────────
      case EventName.TransactionPaymentFailed: {
        const txn = event.data as unknown as PaddleTransaction;
        const customerId = txn.customer_id;
        if (!customerId) break;

        const sub = await SubscriptionModel.findOneAndUpdate(
          { paddleCustomerId: customerId },
          { status: 'past_due' },
          { new: true },
        );

        if (sub) {
          sendSubscriptionEmail(sub.userId, 'payment_failed', sub.plan).catch((e) =>
            console.error('[Webhook/Paddle] payment_failed email:', e),
          );
        }

        console.log(`[Webhook/Paddle] Pago fallido — customer:${customerId}`);
        break;
      }

      // ── Trial por terminar ──────────────────────────────────────────
      case 'subscription.trial_ending' as EventName: {
        const paddleSub = event.data as unknown as PaddleSubscription;
        const customerId = paddleSub.customer_id;
        if (!customerId) break;

        const sub = await SubscriptionModel.findOne({ paddleCustomerId: customerId });
        if (sub) {
          sendSubscriptionEmail(sub.userId, 'trial_ending', sub.plan).catch((e) =>
            console.error('[Webhook/Paddle] trial_ending email:', e),
          );
        }

        console.log(`[Webhook/Paddle] Trial terminando — customer:${customerId}`);
        break;
      }

      default:
        break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Webhook/Paddle] Handler error:', msg);
    // Retornamos 200 para evitar reintentos de Paddle — el error es nuestro
  }

  return NextResponse.json({ received: true });
}
