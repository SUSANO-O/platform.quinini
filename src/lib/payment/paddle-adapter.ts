/**
 * PaddleAdapter — implementa PaymentServiceInterface usando Paddle Billing v2.
 * El núcleo de la app solo importa la interfaz; este archivo es el único que
 * conoce los detalles del SDK de Paddle.
 */

import { paddle, PLANS } from '@/lib/paddle';
import type {
  PaymentServiceInterface,
  CreateCheckoutParams,
  CheckoutResult,
  CreateTopupCheckoutParams,
  ChangePlanParams,
  InvoiceItem,
} from './interface';

function isoToEpoch(iso: string | undefined | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

function paddleBaseUrl(): string {
  return process.env.PADDLE_ENVIRONMENT === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';
}

async function paddleFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(`${paddleBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

export class PaddleAdapter implements PaymentServiceInterface {

  async getOrCreateCustomerId(userId: string, email: string): Promise<string> {
    for await (const customer of paddle.customers.list({ email: [email] })) {
      return customer.id;
    }
    const customer = await paddle.customers.create({
      email,
      customData: { userId },
    });
    return customer.id;
  }

  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const { userId, email, plan, priceId } = params;
    const customerId = await this.getOrCreateCustomerId(userId, email);

    const transaction = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customerId,
      customData: { userId, plan },
    });

    // transaction.checkout.url es la URL del hosted checkout de Paddle
    const url = (transaction as unknown as { checkout?: { url?: string } }).checkout?.url;
    if (!url) throw new Error('Paddle no devolvió una URL de checkout.');
    return { url };
  }

  async createTopupCheckout(params: CreateTopupCheckoutParams): Promise<CheckoutResult> {
    const { userId, email, packId, priceId, conversations } = params;
    const customerId = await this.getOrCreateCustomerId(userId, email);

    const transaction = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customerId,
      customData: {
        userId,
        packId,
        conversations: String(conversations),
        type: 'conversation_pack',
      },
    });

    const url = (transaction as unknown as { checkout?: { url?: string } }).checkout?.url;
    if (!url) throw new Error('Paddle no devolvió una URL de checkout para el pack.');
    return { url };
  }

  async changeSubscriptionPlan(params: ChangePlanParams): Promise<void> {
    const { subscriptionId, newPriceId, planLabel } = params;

    const sub = await paddle.subscriptions.get(subscriptionId);
    const existingItem = sub.items?.[0];
    if (!existingItem) throw new Error('La suscripción no tiene ítems de facturación.');

    const currentPriceId = (existingItem as unknown as { price?: { id?: string } }).price?.id;
    if (currentPriceId === newPriceId) throw new Error('Ya tienes este plan.');

    await paddle.subscriptions.update(subscriptionId, {
      items: [{ priceId: newPriceId, quantity: 1 }],
      prorationBillingMode: 'prorated_immediately',
      customData: { plan: planLabel },
    });
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    await paddle.subscriptions.cancel(subscriptionId, {
      effectiveFrom: atPeriodEnd ? 'next_billing_period' : 'immediately',
    });
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    // Deshace la cancelación programada vía DELETE /subscriptions/{id}/scheduled-change
    const res = await paddleFetch(
      `/subscriptions/${subscriptionId}/scheduled-change`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Paddle resume falló: ${res.status} — ${text}`);
    }
  }

  async getBillingPortalUrl(customerId: string, _returnUrl: string): Promise<string> {
    // POST /portal/sessions — crea una sesión autenticada del Customer Portal de Paddle
    const res = await paddleFetch('/portal/sessions', {
      method: 'POST',
      body: JSON.stringify({ customer_id: customerId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Paddle portal session falló: ${res.status} — ${text}`);
    }
    const data = await res.json() as {
      data?: { urls?: { general?: { overview?: string } } };
    };
    const url = data.data?.urls?.general?.overview;
    if (!url) throw new Error('Paddle no devolvió URL del portal de cliente.');
    return url;
  }

  async getPaymentMethodUpdateUrl(subscriptionId: string): Promise<string> {
    const sub = await paddle.subscriptions.get(subscriptionId);
    const url = (sub as unknown as {
      managementUrls?: { updatePaymentMethod?: string };
    }).managementUrls?.updatePaymentMethod;
    if (!url) throw new Error('Paddle no tiene URL para actualizar el método de pago.');
    return url;
  }

  async getInvoices(customerId: string): Promise<InvoiceItem[]> {
    const items: InvoiceItem[] = [];

    for await (const txn of paddle.transactions.list({
      customerId: [customerId],
      status: ['completed'],
      perPage: 36,
    } as Parameters<typeof paddle.transactions.list>[0])) {
      const raw = txn as unknown as {
        id: string;
        invoiceNumber?: string | null;
        status?: string | null;
        details?: { totals?: { total?: string } };
        currencyCode?: string;
        createdAt?: string;
        invoiceId?: string | null;
      };

      const amountStr = raw.details?.totals?.total ?? '0';
      const amountCents = parseInt(amountStr, 10);

      items.push({
        id: raw.id,
        number: raw.invoiceNumber ?? null,
        status: raw.status ?? null,
        amountPaid: amountCents,
        amountDue: amountCents,
        currency: raw.currencyCode ?? 'USD',
        created: isoToEpoch(raw.createdAt),
        hostedInvoiceUrl: null,
        invoicePdf: null,
      });
    }

    return items;
  }
}

/** Helpers de resolución de plan — usados por subscription.ts */

export function planFromPaddlePriceId(priceId: string | undefined): string | null {
  if (!priceId) return null;
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.priceId === priceId) return key;
  }
  return null;
}

export function resolvePlanFromPaddleSubscription(sub: unknown): string | null {
  const s = sub as {
    customData?: Record<string, unknown> | null;
    custom_data?: Record<string, unknown> | null;
    items?: Array<{
      price?: {
        id?: string;
        unitPrice?: { amount?: string };
        unit_price?: { amount?: string };
      };
      current_billing_period?: unknown;
    }>;
  };

  const metaPlan = (s.customData ?? s.custom_data)?.plan;
  if (typeof metaPlan === 'string' && ['starter', 'growth', 'business', 'enterprise'].includes(metaPlan)) {
    return metaPlan;
  }

  const priceId = s.items?.[0]?.price?.id;
  const byPriceId = planFromPaddlePriceId(priceId);
  if (byPriceId) return byPriceId;

  const amountStr =
    s.items?.[0]?.price?.unitPrice?.amount ??
    s.items?.[0]?.price?.unit_price?.amount;
  if (amountStr) {
    const cents = parseInt(amountStr, 10);
    for (const [key, plan] of Object.entries(PLANS)) {
      if (plan.price * 100 === cents) return key;
    }
  }

  return null;
}

export function mapPaddleStatusToDb(status: string | undefined): string {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'canceled':
    case 'past_due':
      return status;
    case 'paused':
      return 'past_due';
    case 'expired':
      return 'canceled';
    default:
      return 'past_due';
  }
}

export function isoToEpochExport(iso: string | undefined | null): number {
  return isoToEpoch(iso);
}
