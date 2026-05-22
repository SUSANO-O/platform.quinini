/**
 * LemonSqueezyAdapter — implementa PaymentServiceInterface usando LemonSqueezy.
 * Reemplaza paddle-adapter.ts
 */

import {
  createCheckout,
  getSubscription,
  updateSubscription,
  cancelSubscription,
  getCustomer,
  listCustomers,
  listSubscriptions,
  listSubscriptionInvoices,
  listOrders,
  generateSubscriptionInvoice,
  generateOrderInvoice,
} from '@lemonsqueezy/lemonsqueezy.js';
import { ensureLSSetup, LS_STORE_ID, PLANS, planFromLSVariantId, mapLSStatusToDb } from '@/lib/lemonsqueezy';
import type { BillingProfile } from '@/lib/billing-profile';
import { billingProfileToLsParams } from '@/lib/billing-profile';
import type {
  PaymentServiceInterface,
  CreateCheckoutParams,
  CheckoutResult,
  CreateTopupCheckoutParams,
  ChangePlanParams,
  InvoiceItem,
  GetInvoicesParams,
} from './interface';

// ── helpers ─────────────────────────────────────────────────────────────────

const VARIANT_ENV_BY_PLAN: Record<string, string> = {
  solo:    'LEMONSQUEEZY_VARIANT_SOLO',
  basic:   'LEMONSQUEEZY_VARIANT_BASIC',
  team:    'LEMONSQUEEZY_VARIANT_TEAM',
  plus:    'LEMONSQUEEZY_VARIANT_PLUS',
  starter: 'LEMONSQUEEZY_VARIANT_STARTER',
  growth:  'LEMONSQUEEZY_VARIANT_GROWTH',
  business: 'LEMONSQUEEZY_VARIANT_BUSINESS',
};

function variantEnvVarName(planLabel: string): string {
  return VARIANT_ENV_BY_PLAN[planLabel.toLowerCase()] ?? 'LEMONSQUEEZY_VARIANT_*';
}

function explainLsPlanChangeError(planLabel: string, newPriceId: string, rawError: string): string {
  const env = variantEnvVarName(planLabel);
  if (rawError.includes('Entity not found') && rawError.includes('variant_id')) {
    return (
      `Lemon Squeezy no encontró la variante de pago para el plan «${planLabel}» (variant_id=${newPriceId}). ` +
      `En el panel de Lemon Squeezy abre la tienda correcta → Productos → el producto de suscripción → Variantes y copia el ID numérico de la variante Business. ` +
      `Actualiza ${env} (y LEMONSQUEEZY_STORE_ID) en Vercel o .env; deben ser de la misma tienda. ` +
      `Si Business es otro producto distinto al de la suscripción actual, LS puede rechazar el cambio: en ese caso las tres variantes deberían ser del mismo producto de suscripción o hay que dar de alta una nueva suscripción vía checkout.`
    );
  }
  return `Error al cambiar plan a ${planLabel}: ${rawError}`;
}

function isoToEpoch(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

// ── adapter ─────────────────────────────────────────────────────────────────

export class LemonSqueezyAdapter implements PaymentServiceInterface {

  async getOrCreateCustomerId(userId: string, email: string): Promise<string> {
    ensureLSSetup();
    try {
      const { data } = await listCustomers({
        filter: { storeId: LS_STORE_ID, email },
      } as never);
      const customers = (data as unknown as { data?: Array<{ id: string | number }> })?.data;
      if (customers && customers.length > 0) return String(customers[0].id);
    } catch {
      // si LS no tiene el cliente aún, lo creará automáticamente al completar checkout
    }
    return '';
  }

  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutResult> {
    ensureLSSetup();
    const { userId, email, plan, priceId, successUrl } = params;
    const variantId = parseInt(priceId, 10);

    const { data, error } = await createCheckout(LS_STORE_ID, variantId, {
      checkoutOptions: { embed: false, media: false, logo: true },
      checkoutData: {
        email,
        custom: { user_id: userId, plan },
      },
      productOptions: {
        redirectUrl: successUrl,
        receiptButtonText: 'Volver al dashboard',
        receiptThankYouNote: '¡Gracias por tu suscripción!',
        enabledVariants: [variantId],
      },
    } as never);

    if (error) throw new Error(`LemonSqueezy checkout error: ${JSON.stringify(error)}`);
    const url = (data as unknown as { data?: { attributes?: { url?: string } } })?.data?.attributes?.url;
    if (!url) throw new Error('LemonSqueezy no devolvió una URL de checkout.');
    return { url };
  }

  async createTopupCheckout(params: CreateTopupCheckoutParams): Promise<CheckoutResult> {
    ensureLSSetup();
    const { userId, email, packId, priceId, conversations, successUrl } = params;
    const variantId = parseInt(priceId, 10);

    const { data, error } = await createCheckout(LS_STORE_ID, variantId, {
      checkoutOptions: { embed: false, media: false },
      checkoutData: {
        email,
        custom: { user_id: userId, packId, conversations: String(conversations), type: 'conversation_pack' },
      },
      productOptions: {
        redirectUrl: successUrl,
        receiptButtonText: 'Volver al dashboard',
        enabledVariants: [variantId],
      },
    } as never);

    if (error) throw new Error(`LemonSqueezy topup error: ${JSON.stringify(error)}`);
    const url = (data as unknown as { data?: { attributes?: { url?: string } } })?.data?.attributes?.url;
    if (!url) throw new Error('LemonSqueezy no devolvió URL de checkout para el pack.');
    return { url };
  }

  async changeSubscriptionPlan(params: ChangePlanParams): Promise<void> {
    ensureLSSetup();
    const { subscriptionId, newPriceId, planLabel } = params;

    const variantId = parseInt(newPriceId, 10);
    if (!Number.isFinite(variantId) || variantId <= 0) {
      throw new Error(
        `ID de variante Lemon Squeezy inválido para «${planLabel}» («${newPriceId}»). ` +
          `Configura ${variantEnvVarName(planLabel)} con el ID numérico de la variante en el panel de LS.`,
      );
    }

    const { data: current } = await getSubscription(subscriptionId as never);
    const currentVariant = (current as unknown as { data?: { attributes?: { variant_id?: number } } })?.data?.attributes?.variant_id;
    if (currentVariant && String(currentVariant) === newPriceId) {
      throw new Error('Ya tienes este plan.');
    }

    const { error } = await updateSubscription(subscriptionId as never, {
      variantId,
      invoiceImmediately: true,
    } as never);

    if (error) {
      const raw = JSON.stringify(error);
      throw new Error(explainLsPlanChangeError(planLabel, String(variantId), raw));
    }
  }

  async cancelSubscription(subscriptionId: string, _atPeriodEnd: boolean): Promise<void> {
    ensureLSSetup();
    const { error } = await cancelSubscription(subscriptionId as never);
    if (error) throw new Error(`Error al cancelar suscripción: ${JSON.stringify(error)}`);
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    ensureLSSetup();
    const { error } = await updateSubscription(subscriptionId as never, {
      cancelled: false,
    } as never);
    if (error) throw new Error(`Error al reactivar suscripción: ${JSON.stringify(error)}`);
  }

  async getBillingPortalUrl(customerId: string, _returnUrl: string): Promise<string> {
    ensureLSSetup();
    const { data, error } = await getCustomer(customerId as never);
    if (error) throw new Error(`Error al obtener cliente LS: ${JSON.stringify(error)}`);
    const url = (data as unknown as {
      data?: { attributes?: { urls?: { customer_portal?: string } } }
    })?.data?.attributes?.urls?.customer_portal;
    if (!url) throw new Error('LemonSqueezy no devolvió URL del portal de cliente.');
    return url;
  }

  async getPaymentMethodUpdateUrl(subscriptionId: string): Promise<string> {
    ensureLSSetup();
    const { data, error } = await getSubscription(subscriptionId as never);
    if (error) throw new Error(`Error al obtener suscripción LS: ${JSON.stringify(error)}`);
    const url = (data as unknown as {
      data?: { attributes?: { urls?: { update_payment_method?: string } } }
    })?.data?.attributes?.urls?.update_payment_method;
    if (!url) throw new Error('LemonSqueezy no tiene URL para actualizar el método de pago.');
    return url;
  }

  async getInvoices(params: GetInvoicesParams): Promise<InvoiceItem[]> {
    ensureLSSetup();
    const { customerId, subscriptionIds = [], userEmail } = params;
    const items: InvoiceItem[] = [];

    try {
      const subIds = new Set(subscriptionIds.filter(Boolean).map(String));

      if (userEmail?.trim()) {
        const { data: subs } = await listSubscriptions({
          filter: { storeId: LS_STORE_ID, userEmail: userEmail.trim() },
          page: { size: 50 },
        } as never);
        const subsData = (subs as unknown as { data?: Array<{ id: string | number }> })?.data ?? [];
        for (const s of subsData) subIds.add(String(s.id));
      }

      if (subIds.size === 0 && customerId) {
        const { data: subs } = await listSubscriptions({
          filter: { storeId: LS_STORE_ID },
          page: { size: 100 },
        } as never);
        const subsData = (subs as unknown as {
          data?: Array<{ id: string | number; attributes?: { customer_id?: number } }>;
        })?.data ?? [];
        for (const s of subsData) {
          if (String(s.attributes?.customer_id ?? '') === String(customerId)) {
            subIds.add(String(s.id));
          }
        }
      }

      for (const subId of subIds) {
        const { data: invoices } = await listSubscriptionInvoices({
          filter: { subscriptionId: subId },
          page: { size: 50 },
        } as never);

        const invList = (invoices as unknown as {
          data?: Array<{
            id: string | number;
            attributes: {
              status: string;
              total: number;
              currency: string;
              created_at: string;
              billing_reason?: string;
              urls?: { invoice_url?: string | null };
            };
          }>;
        })?.data ?? [];

        for (const inv of invList) {
          if (inv.attributes.status !== 'paid') continue;
          const pdfUrl = inv.attributes.urls?.invoice_url ?? null;
          items.push({
            id: `si_${inv.id}`,
            number: `#${inv.id}`,
            status: inv.attributes.status,
            amountPaid: inv.attributes.total,
            amountDue: inv.attributes.total,
            currency: (inv.attributes.currency || 'USD').toUpperCase(),
            created: isoToEpoch(inv.attributes.created_at),
            hostedInvoiceUrl: pdfUrl,
            invoicePdf: pdfUrl,
            kind: 'subscription',
            description:
              inv.attributes.billing_reason === 'initial'
                ? 'Suscripción — alta'
                : inv.attributes.billing_reason === 'renewal'
                  ? 'Suscripción — renovación'
                  : 'Suscripción',
          });
        }
      }

      if (userEmail?.trim()) {
        const { data: orders } = await listOrders({
          filter: { storeId: LS_STORE_ID, userEmail: userEmail.trim() },
          page: { size: 50 },
        } as never);

        const orderList = (orders as unknown as {
          data?: Array<{
            id: string | number;
            attributes: {
              status: string;
              total: number;
              currency: string;
              created_at: string;
              identifier?: string;
              first_order_item?: { product_name?: string; variant_name?: string };
              urls?: { receipt?: string };
            };
          }>;
        })?.data ?? [];

        for (const ord of orderList) {
          if (ord.attributes.status !== 'paid') continue;
          const product = ord.attributes.first_order_item?.product_name ?? 'Compra';
          const variant = ord.attributes.first_order_item?.variant_name ?? '';
          items.push({
            id: `o_${ord.id}`,
            number: ord.attributes.identifier ? `#${ord.attributes.identifier}` : `#${ord.id}`,
            status: ord.attributes.status,
            amountPaid: ord.attributes.total,
            amountDue: ord.attributes.total,
            currency: (ord.attributes.currency || 'USD').toUpperCase(),
            created: isoToEpoch(ord.attributes.created_at),
            hostedInvoiceUrl: ord.attributes.urls?.receipt ?? null,
            invoicePdf: null,
            kind: 'order',
            description: variant ? `${product} — ${variant}` : product,
          });
        }
      }

      items.sort((a, b) => b.created - a.created);
      return items;
    } catch {
      return items.sort((a, b) => b.created - a.created);
    }
  }

  async generateInvoiceDownloadUrl(
    invoiceId: string,
    kind: 'subscription' | 'order',
    profile?: BillingProfile,
  ): Promise<string | null> {
    ensureLSSetup();
    const lsParams = profile ? billingProfileToLsParams(profile) : undefined;
    const rawId = invoiceId.replace(/^(si_|o_)/, '');

    try {
      if (kind === 'subscription') {
        const { data, error } = await generateSubscriptionInvoice(rawId as never, lsParams as never);
        if (error) return null;
        const url = (data as unknown as { meta?: { urls?: { download_invoice?: string } } })?.meta?.urls
          ?.download_invoice;
        return url ?? null;
      }
      const { data, error } = await generateOrderInvoice(rawId as never, lsParams as never);
      if (error) return null;
      const url = (data as unknown as { meta?: { urls?: { download_invoice?: string } } })?.meta?.urls
        ?.download_invoice;
      return url ?? null;
    } catch {
      return null;
    }
  }
}

// ── helpers exportados para subscription.ts y webhook ───────────────────────

export { planFromLSVariantId, mapLSStatusToDb, isoToEpoch as isoToEpochLS };

export function readLSCancelAtPeriodEnd(sub: unknown): boolean {
  const s = sub as { attributes?: { cancelled?: boolean; status?: string } };
  return s.attributes?.cancelled === true && s.attributes?.status === 'active';
}

export function readLSPeriodEndSeconds(sub: unknown): number {
  const s = sub as { attributes?: { renews_at?: string; ends_at?: string; cancelled?: boolean } };
  const iso = s.attributes?.cancelled ? s.attributes?.ends_at : (s.attributes?.renews_at ?? s.attributes?.ends_at);
  return isoToEpoch(iso);
}

export function readLSCreatedSeconds(sub: unknown): number {
  const s = sub as { attributes?: { created_at?: string } };
  return isoToEpoch(s.attributes?.created_at);
}
