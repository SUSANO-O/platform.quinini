export const SUPPORTED_INVOICE_CURRENCIES = ['EUR', 'USD', 'COP', 'GBP', 'MXN'] as const;

/** Medios de pago habituales en factura electrónica (Colombia). */
export const INVOICE_PAYMENT_METHODS = [
  'Transferencia bancaria',
  'Consignación bancaria',
  'PSE',
  'Tarjeta de crédito',
  'Tarjeta de débito',
  'Efectivo',
  'Nequi',
  'Daviplata',
  'Cheque',
  'Criptomoneda / USDT',
  'Otro',
] as const;

export type InvoicePaymentMethod = (typeof INVOICE_PAYMENT_METHODS)[number];

/** Línea guardada: solo concepto, importe, moneda y notas opcionales. */
export type ManualInvoiceLineItem = {
  concept: string;
  amountCents: number;
  currency: string;
  notes: string;
};

export type CreateManualInvoiceLineInput = {
  concept: string;
  amount: number;
  currency: string;
  notes?: string;
};

export function buildLineItemFromInput(input: CreateManualInvoiceLineInput): ManualInvoiceLineItem {
  return {
    concept: input.concept.trim(),
    amountCents: Math.round(input.amount * 100),
    currency: input.currency.toUpperCase(),
    notes: input.notes?.trim().slice(0, 2000) ?? '',
  };
}

export function normalizeStoredLineItem(raw: unknown, fallbackCurrency = 'EUR'): ManualInvoiceLineItem {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    concept: typeof o.concept === 'string' ? o.concept : '',
    amountCents: typeof o.amountCents === 'number' ? o.amountCents : 0,
    currency: typeof o.currency === 'string' ? o.currency : fallbackCurrency,
    notes: typeof o.notes === 'string' ? o.notes : '',
  };
}

export function summarizeConcepts(lines: { concept: string }[]): string {
  return lines.map((l) => l.concept.trim()).filter(Boolean).join(' · ').slice(0, 500);
}

export type InvoiceTotals = {
  currency: string;
  amountCents: number;
  taxPercent: number;
  taxCents: number;
  totalCents: number;
  issuedAt: Date;
};

export function computeInvoiceTotals(
  lines: ManualInvoiceLineItem[],
  taxPercent: number,
): InvoiceTotals {
  const currencies = new Set(lines.map((l) => l.currency));
  const currency = currencies.size === 1 ? [...currencies][0] : 'MIX';
  const rate = Math.min(100, Math.max(0, taxPercent));

  if (currency === 'MIX') {
    return {
      currency: 'MIX',
      amountCents: 0,
      taxPercent: rate,
      taxCents: 0,
      totalCents: 0,
      issuedAt: new Date(),
    };
  }

  const amountCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const taxCents = Math.round(amountCents * (rate / 100));
  return {
    currency,
    amountCents,
    taxPercent: rate,
    taxCents,
    totalCents: amountCents + taxCents,
    issuedAt: new Date(),
  };
}

/** Totales por moneda cuando hay líneas en varias divisas. */
export function computeTotalsByCurrency(
  lines: ManualInvoiceLineItem[],
  taxPercent: number,
): Map<string, { subtotalCents: number; taxCents: number; totalCents: number }> {
  const rate = Math.min(100, Math.max(0, taxPercent));
  const subtotals = new Map<string, number>();

  for (const line of lines) {
    subtotals.set(line.currency, (subtotals.get(line.currency) ?? 0) + line.amountCents);
  }

  const map = new Map<string, { subtotalCents: number; taxCents: number; totalCents: number }>();
  for (const [currency, subtotalCents] of subtotals.entries()) {
    const taxCents = Math.round(subtotalCents * (rate / 100));
    map.set(currency, {
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
    });
  }
  return map;
}

export function formatMoneyCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Formato tipo factura CO (70.000 sin decimales en COP). */
export function formatAmountDisplay(cents: number, currency: string): string {
  const code = currency.toUpperCase();
  const value = cents / 100;
  if (code === 'COP') {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(value);
  }
  return formatMoneyCents(cents, code);
}

export function formatInvoiceTotalDisplay(
  lines: ManualInvoiceLineItem[],
  taxPercent: number,
  stored?: { currency: string; totalCents: number },
): string {
  if (stored && stored.currency !== 'MIX') {
    return formatMoneyCents(stored.totalCents, stored.currency);
  }
  const byCurrency = computeTotalsByCurrency(lines, taxPercent);
  return [...byCurrency.entries()]
    .map(([currency, t]) => formatMoneyCents(t.totalCents, currency))
    .join(' + ');
}
