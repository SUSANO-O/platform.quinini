/**
 * PaymentServiceInterface — contrato central para el procesador de pagos.
 * Aplica Inversión de Dependencias: el núcleo de la app depende de esta interfaz,
 * no de ninguna librería de proveedor específica.
 *
 * Implementaciones:
 *   - PaddleAdapter (activo)  →  src/lib/payment/paddle-adapter.ts
 *   // StripeAdapter (comentado) →  stripe lógica en src/lib/billing.ts (legacy)
 */

export interface CreateCheckoutParams {
  userId: string;
  email: string;
  plan: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string;
}

export interface CreateTopupCheckoutParams {
  userId: string;
  email: string;
  packId: string;
  priceId: string;
  conversations: number;
  successUrl: string;
  cancelUrl: string;
}

export interface ChangePlanParams {
  subscriptionId: string;
  newPriceId: string;
  userId: string;
  planLabel: string;
  currentPriceId?: string;
}

export interface InvoiceItem {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  amountDue: number;
  currency: string;
  /** Epoch segundos */
  created: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

export interface PaymentServiceInterface {
  /** Busca o crea un cliente en el proveedor. Retorna el ID del proveedor. */
  getOrCreateCustomerId(userId: string, email: string): Promise<string>;

  /** Crea una sesión de checkout para una nueva suscripción. */
  createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutResult>;

  /** Crea un checkout para una compra única de pack de conversaciones. */
  createTopupCheckout(params: CreateTopupCheckoutParams): Promise<CheckoutResult>;

  /** Actualiza el plan de una suscripción activa (con prorrateo). */
  changeSubscriptionPlan(params: ChangePlanParams): Promise<void>;

  /** Cancela la suscripción al final del periodo o de inmediato. */
  cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void>;

  /** Deshace una cancelación programada para que la suscripción siga renovándose. */
  resumeSubscription(subscriptionId: string): Promise<void>;

  /** Retorna una URL para gestionar la facturación (portal del cliente). */
  getBillingPortalUrl(customerId: string, returnUrl: string): Promise<string>;

  /** Retorna la URL de Paddle para actualizar el método de pago de una suscripción. */
  getPaymentMethodUpdateUrl(subscriptionId: string): Promise<string>;

  /** Lista facturas/transacciones completadas para un cliente. */
  getInvoices(customerId: string): Promise<InvoiceItem[]>;
}
