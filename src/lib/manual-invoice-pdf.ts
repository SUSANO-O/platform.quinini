/**
 * Emisor y generación PDF de facturas/recibos manuales.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { BRAND_NAME } from '@/lib/brand';
import type { BillingProfile } from '@/lib/billing-profile';

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

export async function buildManualInvoicePdf(data: ManualInvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.45, 0.45, 0.5);

  let y = 800;

  const draw = (
    text: string,
    opts: { x?: number; size?: number; bold?: boolean; color?: typeof black } = {},
  ) => {
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

  draw('RECIBO / FACTURA', { size: 18, bold: true });
  draw(`N.º ${data.invoiceNumber}`, { size: 12, bold: true });
  draw(
    `Fecha: ${data.issuedAt.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`,
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

  draw('Concepto', { x: 50, size: 9, bold: true, color: muted });
  y -= 4;
  for (const line of wrapLines(data.concept, 70).slice(0, 4)) {
    draw(line, { x: 50, size: 10 });
  }
  y -= 6;

  draw(`Base imponible: ${formatMoney(data.amountCents, data.currency)}`, { x: 320 });
  if (data.taxPercent > 0) {
    draw(`IVA (${data.taxPercent}%): ${formatMoney(data.taxCents, data.currency)}`, { x: 320 });
  }
  draw(`TOTAL: ${formatMoney(data.totalCents, data.currency)}`, { x: 320, size: 12, bold: true });

  if (data.paymentMethod?.trim()) {
    y -= 8;
    draw(`Forma de pago: ${data.paymentMethod}`, { size: 9, color: muted });
  }
  if (data.paymentRef?.trim()) {
    draw(`Referencia: ${data.paymentRef}`, { size: 9, color: muted });
  }
  if (data.notes?.trim()) {
    y -= 10;
    draw('Notas', { size: 9, bold: true, color: muted });
    for (const line of wrapLines(data.notes, 85).slice(0, 6)) {
      draw(line, { size: 9, color: muted });
    }
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
