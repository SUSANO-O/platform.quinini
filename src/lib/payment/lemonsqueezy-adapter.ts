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
} from '@lemonsqueezy/lemonsqueezy.js';
import { ensureLSSetup, LS_STORE_ID, PLANS, planFromLSVariantId, mapLSStatusToDb } from '@/lib/lemonsqueezy';
import type {
  PaymentServiceInterface,
  CreateCheckoutParams,
  CheckoutResult,
  CreateTopupCheckoutParams,
  ChangePlanParams,
  InvoiceItem,
} from './interface';

// ── helpers ─────────────────────────────────────────────────────────────────

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
        custom: { userId, plan },
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
        custom: { userId, packId, conversations: String(conversations), type: 'conversation_pack' },
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

    const { data: current } = await getSubscription(subscriptionId as never);
    const currentVariant = (current as unknown as { data?: { attributes?: { variant_id?: number } } })?.data?.attributes?.variant_id;
    if (currentVariant && String(currentVariant) === newPriceId) {
      throw new Error('Ya tienes este plan.');
    }

    const { error } = await updateSubscription(subscriptionId as never, {
      variantId: parseInt(newPriceId, 10),
      invoiceImmediately: true,
    } as never);

    if (error) throw new Error(`Error al cambiar plan a ${planLabel}: ${JSON.stringify(error)}`);
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

  async getInvoices(customerId: string): Promise<InvoiceItem[]> {
    ensureLSSetup();
    try {
      // Buscar suscripción por customerId para obtener facturas
      const { data: subs } = await listSubscriptions({
        filter: { storeId: LS_STORE_ID, customerId },
      } as never);
      const subsData = (subs as unknown as { data?: Array<{ id: string | number }> })?.data;
      if (!subsData || subsData.length === 0) return [];

      const subId = subsData[0].id;
      const { data: invoices } = await listSubscriptionInvoices({
        filter: { subscriptionId: subId, status: 'paid' },
      } as never);

      const items = (invoices as unknown as {
        data?: Array<{
          id: string | number;
          attributes: {
            status: string;
            total: number;
            currency: string;
            created_at: string;
          };
        }>;
      })?.data;

      if (!items) return [];

      return items.map((inv) => ({
        id: String(inv.id),
        number: null,
        status: inv.attributes.status,
        amountPaid: inv.attributes.total,
        amountDue: inv.attributes.total,
        currency: (inv.attributes.currency || 'USD').toUpperCase(),
        created: isoToEpoch(inv.attributes.created_at),
        hostedInvoiceUrl: null,
        invoicePdf: null,
      }));
    } catch {
      return [];
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
