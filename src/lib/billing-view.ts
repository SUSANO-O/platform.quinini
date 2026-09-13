/**
 * Presentación de la facturación: importes, estado de una factura y a qué API
 * pedir la lista.
 *
 * Estaba dentro de `invoice-list.tsx` y de la página de facturas, sin pruebas.
 * Aquí se formatea dinero, así que conviene tenerlo cubierto.
 */

export type InvoiceTone = 'success' | 'warning' | 'neutral';

/** Los importes llegan en céntimos. */
export function formatMoney(cents: number, currency: string): string {
  const unidades = cents / 100;
  try {
    return new Intl.NumberFormat('es', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(unidades);
  } catch {
    // Moneda que `Intl` no reconoce: mejor un formato simple que una fila vacía.
    return `${unidades.toFixed(2)} ${currency}`.trim();
  }
}

const ESTADOS: Record<string, { label: string; tone: InvoiceTone }> = {
  paid: { label: 'Pagada', tone: 'success' },
  completed: { label: 'Completada', tone: 'success' },
  open: { label: 'Pendiente', tone: 'warning' },
  void: { label: 'Anulada', tone: 'neutral' },
  refunded: { label: 'Reembolsada', tone: 'neutral' },
};

/** Un estado que no conocemos se muestra tal cual, sin inventarle color. */
export function statusLabel(s: string | null): { label: string; tone: InvoiceTone } {
  if (!s) return { label: '—', tone: 'neutral' };
  return ESTADOS[s] ?? { label: s, tone: 'neutral' };
}

/** Estados en los que existe una suscripción de pago de la que hablar. */
const ESTADOS_DE_PAGO = ['active', 'trialing', 'past_due', 'canceled'];

/**
 * Si la cuenta tiene un plan de pago. `canceled` cuenta: el cliente sigue
 * teniendo recibos que descargar y un portal que abrir.
 */
export function hasPaidPlan(
  subscription: { status?: string; plan?: string } | null | undefined,
): boolean {
  if (!subscription?.status || !subscription.plan) return false;
  if (subscription.plan === 'free') return false;
  return ESTADOS_DE_PAGO.includes(subscription.status);
}

/** Ruta de la API de facturas; con `adminUserId`, la de administración. */
export function invoiceApiBase(adminUserId?: string): string {
  const id = adminUserId?.trim();
  if (!id) return '/api/billing';
  return `/api/admin/billing/${encodeURIComponent(id)}`;
}
