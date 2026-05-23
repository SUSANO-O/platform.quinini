/**
 * Emisor y generación PDF de facturas/recibos manuales.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { BRAND_NAME } from '@/lib/brand';
import type { BillingProfile } from '@/lib/billing-profile';
import {
  computeTotalsByCurrency,
  formatMoneyCents,
  normalizeStoredLineItem,
  type ManualInvoiceLineItem,
} from '@/lib/manual-invoice-line';

export type { ManualInvoiceLineItem } from '@/lib/manual-invoice-line';

export type InvoiceIssuer = {
  name: string;
  taxId: string;
  address: string;
  city: string;
  email: string;
};

export type ManualInvoicePdfData = {
  invoiceNumber: string;
  issuedAt: Date;
  concept: string;
  lineItems?: ManualInvoiceLineItem[];
  amountCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  taxPercent: number;
  paymentMethod?: string;
  paymentRef?: string;
  notes?: string;
  buyer: BillingProfile & { email?: string };
  issuer: InvoiceIssuer;
};

export function getDefaultIssuer(): InvoiceIssuer {
  return {
    name: process.env.BILLING_ISSUER_NAME?.trim() || BRAND_NAME,
    taxId: process.env.BILLING_ISSUER_TAX_ID?.trim() || '',
    address: process.env.BILLING_ISSUER_ADDRESS?.trim() || '',
    city: process.env.BILLING_ISSUER_CITY?.trim() || '',
    email: process.env.BILLING_ISSUER_EMAIL?.trim() || 'facturacion@botiva.app',
  };
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = w.length > maxChars ? w.slice(0, maxChars) : w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function sanitizePdfText(s: string): string {
  return s.replace(/[^\u0009\u000a\u000d\u0020-\u00ff]/g, '?').trim();
}

function resolveLineItems(data: ManualInvoicePdfData): ManualInvoiceLineItem[] {
  if (data.lineItems?.length) {
    return data.lineItems.map((l) => normalizeStoredLineItem(l, data.currency));
  }
  return [
    normalizeStoredLineItem(
      { concept: data.concept, amountCents: data.amountCents, currency: data.currency, notes: data.notes ?? '' },
      data.currency,
    ),
  ];
}

export async function buildManualInvoicePdf(data: ManualInvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.45, 0.45, 0.5);

  let y = 800;

  const ensureSpace = (needed: number) => {
    if (y - needed < 70) {
      page = doc.addPage([595.28, 841.89]);
      y = 800;
    }
  };

  const draw = (
    text: string,
    opts: { x?: number; size?: number; bold?: boolean; color?: typeof black } = {},
  ) => {
    ensureSpace((opts.size ?? 10) + 10);
    const t = sanitizePdfText(text);
    if (!t) return;
    page.drawText(t, {
      x: opts.x ?? 50,
      y,
      size: opts.size ?? 10,
      font: opts.bold ? fontBold : font,
      color: opts.color ?? black,
    });
    y -= (opts.size ?? 10) + 6;
  };

  const items = resolveLineItems(data);
  const headerDate = data.issuedAt;

  draw('RECIBO / FACTURA', { size: 18, bold: true });
  draw(`N.º ${data.invoiceNumber}`, { size: 12, bold: true });
  draw(
    `Fecha documento: ${headerDate.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    { size: 10, color: muted },
  );
  y -= 8;

  draw('EMISOR', { size: 11, bold: true });
  draw(data.issuer.name, { bold: true });
  if (data.issuer.taxId) draw(`NIF/CIF: ${data.issuer.taxId}`);
  if (data.issuer.address) draw(data.issuer.address);
  if (data.issuer.city) draw(data.issuer.city);
  if (data.issuer.email) draw(data.issuer.email);
  y -= 8;

  draw('CLIENTE', { size: 11, bold: true });
  draw(data.buyer.companyName || 'Cliente', { bold: true });
  if (data.buyer.taxId) draw(`NIF/CIF: ${data.buyer.taxId}`);
  if (data.buyer.address) draw(data.buyer.address);
  const cityLine = [data.buyer.zipCode, data.buyer.city, data.buyer.state].filter(Boolean).join(' ');
  if (cityLine) draw(cityLine);
  if (data.buyer.country) draw(data.buyer.country);
  if (data.buyer.email) draw(data.buyer.email);
  y -= 12;

  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: muted });
  y -= 18;

  draw('Detalle', { size: 11, bold: true });
  y -= 4;

  page.drawText('Concepto', { x: 50, y, size: 9, font: fontBold, color: muted });
  page.drawText('Importe', { x: 420, y, size: 9, font: fontBold, color: muted });
  page.drawText('Mon.', { x: 510, y, size: 9, font: fontBold, color: muted });
  y -= 14;

  items.forEach((item, index) => {
    ensureSpace(80);
    if (index > 0) y -= 4;

    const conceptLines = wrapLines(item.concept, 55).slice(0, 2);
    for (let i = 0; i < conceptLines.length; i++) {
      page.drawText(sanitizePdfText(conceptLines[i]), { x: 50, y, size: 10, font, color: black });
      if (i === 0) {
        page.drawText(sanitizePdfText(formatMoney(item.amountCents, item.currency)), {
          x: 420, y, size: 10, font, color: black,
        });
        page.drawText(sanitizePdfText(item.currency), { x: 510, y, size: 10, font, color: black });
      }
      y -= 14;
    }

    if (item.notes?.trim()) {
      for (const line of wrapLines(item.notes, 75).slice(0, 2)) {
        page.drawText(sanitizePdfText(`Nota: ${line}`), { x: 60, y, size: 8, font, color: muted });
        y -= 11;
      }
    }
  });

  y -= 6;
  page.drawLine({ start: { x: 50, y: y + 8 }, end: { x: 545, y: y + 8 }, thickness: 0.5, color: muted });
  y -= 10;

  const taxPercent = data.taxPercent ?? 0;
  if (data.currency === 'MIX' || new Set(items.map((l) => l.currency)).size > 1) {
    const byCurrency = computeTotalsByCurrency(items, taxPercent);
    for (const [currency, t] of byCurrency.entries()) {
      draw(`Subtotal (${currency}): ${formatMoneyCents(t.subtotalCents, currency)}`, { x: 320 });
      if (taxPercent > 0) {
        draw(`IVA (${taxPercent}%): ${formatMoneyCents(t.taxCents, currency)}`, { x: 320 });
      }
      draw(`TOTAL (${currency}): ${formatMoneyCents(t.totalCents, currency)}`, { x: 320, size: 11, bold: true });
    }
  } else {
    const currency = data.currency || items[0]?.currency || 'EUR';
    const subtotal = data.amountCents || items.reduce((s, l) => s + l.amountCents, 0);
    const taxCents = data.taxCents ?? Math.round(subtotal * (taxPercent / 100));
    const total = data.totalCents ?? subtotal + taxCents;
    draw(`Subtotal: ${formatMoneyCents(subtotal, currency)}`, { x: 320 });
    if (taxPercent > 0) {
      draw(`IVA (${taxPercent}%): ${formatMoneyCents(taxCents, currency)}`, { x: 320 });
    }
    draw(`TOTAL: ${formatMoneyCents(total, currency)}`, { x: 320, size: 12, bold: true });
  }

  y = 60;
  draw(
    `Documento generado por ${BRAND_NAME}. Comprobante de pago manual; no sustituye factura fiscal emitida por LemonSqueezy cuando aplique.`,
    { size: 8, color: muted },
  );

  return doc.save();
}

export async function nextManualInvoiceNumber(userId: string): Promise<string> {
  const { ManualInvoice } = await import('@/lib/db/models');
  const year = new Date().getFullYear();
  const prefix = `BIV-${year}-`;
  const last = await ManualInvoice.findOne({
    userId,
    invoiceNumber: { $regex: `^${prefix}` },
  })
    .sort({ invoiceNumber: -1 })
    .select({ invoiceNumber: 1 })
    .lean() as { invoiceNumber?: string } | null;

  let seq = 1;
  if (last?.invoiceNumber?.startsWith(prefix)) {
    const tail = parseInt(last.invoiceNumber.slice(prefix.length), 10);
    if (!Number.isNaN(tail)) seq = tail + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}
