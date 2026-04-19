/**
 * POST /api/webhooks/lemonsqueezy
 * Maneja eventos de LemonSqueezy para el ciclo de vida de suscripciones
 * y pagos únicos (conversation packs).
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Subscription as SubscriptionModel, User, ConversationPack } from '@/lib/db/models';
import { sendPaidInvoiceEmail, sendSubscriptionEmail, type PaidInvoiceEmailKind } from '@/lib/email';
import { mapLSStatusToDb, planFromLSVariantId } from '@/lib/lemonsqueezy';

// ── Tipos internos ────────────────────────────────────────────────────────────

type LSMeta = {
  event_name: string;
  custom_data?: Record<string, string> | null;
  test_mode?: boolean;
};

type LSSubscriptionAttributes = {
  customer_id: number;
  status: string;
  variant_id: number;
  cancelled: boolean;
  renews_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
};

type LSOrderAttributes = {
  customer_id: number;
  status: string;
  total: number;
  currency: string;
  created_at?: string;
  identifier?: string;
};

type LSWebhookPayload = {
  meta: LSMeta;
  data: {
    id: string;
    type: string;
    attributes: LSSubscriptionAttributes | LSOrderAttributes;
  };
};

// ── helpers ───────────────────────────────────────────────────────────────────

function isoToEpoch(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

function periodEnd(attr: LSSubscriptionAttributes): number {
  const iso = attr.cancelled ? attr.ends_at : (attr.renews_at ?? attr.ends_at);
  return isoToEpoch(iso);
}

// ── handler principal ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('x-signature') || '';
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '';

  if (!secret) {
    console.error('[Webhook/LS] LEMONSQUEEZY_WEBHOOK_SECRET no configurado');
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 });
  }

  // Verificación HMAC SHA-256
  try {
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    if (!signature || signature.length !== expected.length) {
      console.error('[Webhook/LS] Firma ausente o longitud incorrecta — recibida:', signature?.length ?? 0, 'esperada:', expected.length);
      return NextResponse.json({ error: 'Webhook Error: firma inválida' }, { status: 400 });
    }
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      console.error('[Webhook/LS] Firma no coincide. ¿Coincide LEMONSQUEEZY_WEBHOOK_SECRET en Vercel?');
      return NextResponse.json({ error: 'Webhook Error: firma no coincide' }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Webhook/LS] Error de firma:', msg);
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  let payload: LSWebhookPayload;
  try {
    payload = JSON.parse(body) as LSWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const eventName = payload.meta.event_name;
  const customData = payload.meta.custom_data ?? {};
  const data = payload.data;

  console.log(`[Webhook/LS] evento:${eventName} id:${data.id} customData:${JSON.stringify(customData)}`);

  await connectDB();

  try {
    switch (eventName) {

      // ── Nueva suscripción ───────────────────────────────────────────────
      case 'subscription_created': {
        const attr = data.attributes as LSSubscriptionAttributes;
        const userId = customData.userId;
        if (!userId) {
          console.warn('[Webhook/LS] subscription_created sin userId — id:', data.id);
          break;
        }

        const plan = customData.plan || planFromLSVariantId(attr.variant_id) || 'starter';
        const status = mapLSStatusToDb(attr.status);
        const currentPeriodEnd = periodEnd(attr);
        const created = isoToEpoch((attr as LSSubscriptionAttributes).created_at);

        await SubscriptionModel.findOneAndUpdate(
          { userId },
          {
            $set: {
              lsCustomerId: String(attr.customer_id),
              lsSubscriptionId: data.id,
              status,
              plan,
              currentPeriodEnd,
              cancelAtPeriodEnd: false,
              stripeSubscriptionCreated: created,
            },
          },
          { upsert: true },
        );

        console.log(`[Webhook/LS] subscription_created — user:${userId} plan:${plan}`);
        break;
      }

      // ── Suscripción actualizada ─────────────────────────────────────────
      case 'subscription_updated':
      case 'subscription_resumed': {
        const attr = data.attributes as LSSubscriptionAttributes;
        const customerId = String(attr.customer_id);
        const status = mapLSStatusToDb(attr.status);
        const plan = planFromLSVariantId(attr.variant_id);
        const currentPeriodEnd = periodEnd(attr);
        const cancelAtEnd = attr.cancelled === true && attr.status === 'active';

        const update: Record<string, unknown> = {
          lsSubscriptionId: data.id,
          currentPeriodEnd,
          cancelAtPeriodEnd: cancelAtEnd,
        };
        if (plan) update.plan = plan;

        // No sobreescribir 'active' con estados inferiores
        await SubscriptionModel.findOneAndUpdate({ lsCustomerId: customerId }, { $set: update });
        if (status === 'past_due') {
          await SubscriptionModel.findOneAndUpdate(
            { lsCustomerId: customerId, status: { $nin: ['active', 'trialing'] } },
            { $set: { status } },
          );
        } else {
          await SubscriptionModel.findOneAndUpdate(
            { lsCustomerId: customerId },
            { $set: { status } },
          );
        }

        console.log(`[Webhook/LS] ${eventName} — customer:${customerId} status:${status}`);
        break;
      }

      // ── Suscripción cancelada / expirada ────────────────────────────────
      case 'subscription_cancelled':
      case 'subscription_expired': {
        const attr = data.attributes as LSSubscriptionAttributes;
        const customerId = String(attr.customer_id);

        const sub = await SubscriptionModel.findOneAndUpdate(
          { lsCustomerId: customerId },
          { $set: { status: 'canceled', currentPeriodEnd: 0, cancelAtPeriodEnd: false } },
          { new: true },
        );

        if (sub) {
          sendSubscriptionEmail(sub.userId, 'canceled', sub.plan).catch((e) =>
            console.error('[Webhook/LS] canceled email:', e),
          );
        }

        console.log(`[Webhook/LS] ${eventName} — customer:${customerId}`);
        break;
      }

      // ── Pago de suscripción exitoso ─────────────────────────────────────
      case 'subscription_payment_success': {
        const attr = data.attributes as LSOrderAttributes;
        const customerId = String(attr.customer_id);

        // Actualizar currentPeriodEnd desde el sub vinculado al payment
        const sub = await SubscriptionModel.findOne({ lsCustomerId: customerId });
        if (!sub?.userId) break;

        const u = await User.findById(sub.userId).lean() as { email?: string } | null;
        if (!u?.email) break;

        const cur = (attr.currency || 'USD').toUpperCase();
        const amountFormatted = new Intl.NumberFormat('es', { style: 'currency', currency: cur })
          .format(attr.total / 100);

        const planLabel = (({
          starter: 'Starter ($29/mes)',
          growth: 'Growth ($79/mes)',
          business: 'Business ($199/mes)',
          enterprise: 'Enterprise',
        } as Record<string, string>)[sub.plan] ?? sub.plan);

        sendPaidInvoiceEmail(u.email, {
          kind: 'renewal' as PaidInvoiceEmailKind,
          planLabel,
          amountFormatted,
          invoiceNumber: null,
          hostedInvoiceUrl: null,
          pdfBuffer: null,
        }).catch((e) => console.error('[Webhook/LS] payment_success email:', e));

        console.log(`[Webhook/LS] subscription_payment_success — customer:${customerId}`);
        break;
      }

      // ── Pago fallido ────────────────────────────────────────────────────
      case 'subscription_payment_failed': {
        const attr = data.attributes as LSOrderAttributes;
        const customerId = String(attr.customer_id);

        const sub = await SubscriptionModel.findOneAndUpdate(
          { lsCustomerId: customerId },
          { $set: { status: 'past_due' } },
          { new: true },
        );

        if (sub) {
          sendSubscriptionEmail(sub.userId, 'payment_failed', sub.plan).catch((e) =>
            console.error('[Webhook/LS] payment_failed email:', e),
          );
        }

        console.log(`[Webhook/LS] subscription_payment_failed — customer:${customerId}`);
        break;
      }

      // ── Pedido completado (pack de conversaciones one-time) ─────────────
      case 'order_created': {
        const attr = data.attributes as LSOrderAttributes;
        if (attr.status !== 'paid') break;

        const { userId, packId, conversations, type } = customData;
        if (type !== 'conversation_pack' || !userId || !packId || !conversations) break;

        const KNOWN_PACK_IDS = new Set(['pack_s', 'pack_m', 'pack_l']);
        if (!KNOWN_PACK_IDS.has(packId)) {
          console.error(`[Webhook/LS] packId desconocido: "${packId}" — order:${data.id}`);
          break;
        }

        const convCount = parseInt(conversations, 10);
        if (isNaN(convCount) || convCount <= 0) break;

        // Guardar lsCustomerId si aún no lo tenemos
        await SubscriptionModel.findOneAndUpdate(
          { userId, lsCustomerId: { $in: [null, ''] } },
          { $set: { lsCustomerId: String(attr.customer_id) } },
        );

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        try {
          await ConversationPack.create({
            userId,
            packId,
            conversations: convCount,
            used: 0,
            stripeSessionId: `ls_order_${data.id}`,
            expiresAt,
            status: 'active',
          });
          console.log(`[Webhook/LS] Pack acreditado — user:${userId} pack:${packId} conv:${convCount}`);
        } catch (err: unknown) {
          const code = err && typeof err === 'object' && 'code' in err ? (err as { code: unknown }).code : null;
          if (code === 11000) {
            console.log(`[Webhook/LS] Pack ya acreditado (idempotente) — order:${data.id}`);
          } else {
            throw err;
          }
        }
        break;
      }

      default:
        break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Webhook/LS] Handler error:', msg);
  }

  return NextResponse.json({ received: true });
}
