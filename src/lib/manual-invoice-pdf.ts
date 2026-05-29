/**
 * PDF de factura manual — layout tipo factura electrónica de venta (Colombia).
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type RGB } from 'pdf-lib';
import { BRAND_NAME } from '@/lib/brand';
import type { BillingProfile } from '@/lib/billing-profile';
import {
  computeTotalsByCurrency,
  formatAmountDisplay,
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
  state?: string;
  email: string;
  phone?: string;
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

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 32;
const CONTENT_W = PAGE_W - M * 2;

export function getDefaultIssuer(): InvoiceIssuer {
  return {
    name: process.env.BILLING_ISSUER_NAME?.trim() || BRAND_NAME,
    taxId: process.env.BILLING_ISSUER_TAX_ID?.trim() || '',
    address: process.env.BILLING_ISSUER_ADDRESS?.trim() || '',
    city: process.env.BILLING_ISSUER_CITY?.trim() || '',
    state: process.env.BILLING_ISSUER_STATE?.trim() || '',
    email: process.env.BILLING_ISSUER_EMAIL?.trim() || 'business.botiva@gmail.com',
    phone: process.env.BILLING_ISSUER_PHONE?.trim() || '',
  };
}

function sanitizePdfText(s: string): string {
  return s.replace(/[^\u0009\u000a\u000d\u0020-\u00ff]/g, '?').trim();
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

/** Formato numérico estilo factura CO (70.000 sin decimales en COP). */
function formatAmount(cents: number, currency: string): string {
  return formatAmountDisplay(cents, currency);
}

function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

type PdfCtx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  y: number;
  black: RGB;
  muted: RGB;
  border: RGB;
  headerBg: RGB;
};

function newPage(ctx: PdfCtx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - M;
}

function ensureSpace(ctx: PdfCtx, needed: number) {
  if (ctx.y - needed < M + 40) newPage(ctx);
}

function drawText(
  ctx: PdfCtx,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: RGB; maxWidth?: number } = {},
) {
  const t = sanitizePdfText(text);
  if (!t) return;
  ctx.page.drawText(t, {
    x,
    y,
    size: opts.size ?? 8,
    font: opts.bold ? ctx.fontBold : ctx.font,
    color: opts.color ?? ctx.black,
    maxWidth: opts.maxWidth,
  });
}

function drawHLine(ctx: PdfCtx, y: number, x1 = M, x2 = PAGE_W - M) {
  ctx.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: ctx.border });
}

function drawSectionTitle(ctx: PdfCtx, title: string) {
  ensureSpace(ctx, 28);
  const h = 18;
  ctx.page.drawRectangle({
    x: M,
    y: ctx.y - h + 4,
    width: CONTENT_W,
    height: h,
    color: ctx.headerBg,
    borderColor: ctx.border,
    borderWidth: 0.5,
  });
  drawText(ctx, title, M + 6, ctx.y - 10, { size: 8, bold: true });
  ctx.y -= h + 4;
}

/** Cuadrícula 2 columnas × N filas (label | valor | label | valor). */
function drawFieldGrid(ctx: PdfCtx, rows: Array<[string, string, string, string]>) {
  const rowH = 15;
  const colW = CONTENT_W / 2;
  const labelW = 78;
  const boxH = rows.length * rowH + 8;

  ensureSpace(ctx, boxH + 4);
  const top = ctx.y;
  ctx.page.drawRectangle({
    x: M,
    y: top - boxH,
    width: CONTENT_W,
    height: boxH,
    borderColor: ctx.border,
    borderWidth: 0.5,
  });

  let rowY = top - 12;
  for (const [l1, v1, l2, v2] of rows) {
    drawText(ctx, l1, M + 4, rowY, { size: 7, color: ctx.muted, bold: true });
    drawText(ctx, v1 || '—', M + 4 + labelW, rowY, { size: 7, maxWidth: colW - labelW - 10 });
    drawText(ctx, l2, M + colW + 4, rowY, { size: 7, color: ctx.muted, bold: true });
    drawText(ctx, v2 || '—', M + colW + 4 + labelW, rowY, { size: 7, maxWidth: colW - labelW - 10 });
    rowY -= rowH;
  }
  ctx.y = top - boxH - 6;
}

function drawItemsTable(ctx: PdfCtx, items: ManualInvoiceLineItem[], taxPercent: number) {
  const cols = {
    code: M + 2,
    desc: M + 52,
    qty: M + 248,
    pu: M + 288,
    disc: M + 348,
    iva: M + 398,
    sub: M + 448,
  };

  const headerH = 16;
  ensureSpace(ctx, headerH + 24);
  const tableTop = ctx.y;

  ctx.page.drawRectangle({
    x: M,
    y: tableTop - headerH,
    width: CONTENT_W,
    height: headerH,
    color: ctx.headerBg,
    borderColor: ctx.border,
    borderWidth: 0.5,
  });

  const hy = tableTop - 11;
  drawText(ctx, 'Codigo', cols.code, hy, { size: 7, bold: true });
  drawText(ctx, 'Descripcion', cols.desc, hy, { size: 7, bold: true });
  drawText(ctx, 'Cant.', cols.qty, hy, { size: 7, bold: true });
  drawText(ctx, 'P/U', cols.pu, hy, { size: 7, bold: true });
  drawText(ctx, 'Desc.', cols.disc, hy, { size: 7, bold: true });
  drawText(ctx, '% IVA', cols.iva, hy, { size: 7, bold: true });
  drawText(ctx, 'Subtotal', cols.sub, hy, { size: 7, bold: true });

  let rowY = tableTop - headerH - 4;
  const rowH = 14;

  items.forEach((item, idx) => {
    ensureSpace(ctx, rowH + 20);
    if (idx > 0) rowY -= 2;
    rowY -= rowH;

    const code = String(idx + 1).padStart(6, '0');
    drawText(ctx, code, cols.code, rowY, { size: 7 });
    const descLines = wrapLines(item.concept, 28).slice(0, 2);
    drawText(ctx, descLines[0], cols.desc, rowY, { size: 7, maxWidth: 188 });
    drawText(ctx, '1', cols.qty, rowY, { size: 7 });
    drawText(ctx, formatAmount(item.amountCents, item.currency), cols.pu, rowY, { size: 7 });
    drawText(ctx, '0', cols.disc, rowY, { size: 7 });
    drawText(ctx, String(taxPercent), cols.iva, rowY, { size: 7 });
    drawText(ctx, formatAmount(item.amountCents, item.currency), cols.sub, rowY, { size: 7 });

    if (descLines[1]) {
      rowY -= rowH;
      drawText(ctx, descLines[1], cols.desc, rowY, { size: 7, maxWidth: 188 });
    }
    if (item.notes?.trim()) {
      rowY -= rowH;
      drawText(ctx, `Nota: ${wrapLines(item.notes, 40)[0]}`, cols.desc, rowY, { size: 6, color: ctx.muted, maxWidth: 360 });
    }
  });

  const tableBottom = rowY - 6;
  ctx.page.drawRectangle({
    x: M,
    y: tableBottom,
    width: CONTENT_W,
    height: tableTop - tableBottom,
    borderColor: ctx.border,
    borderWidth: 0.5,
  });

  ctx.y = tableBottom - 8;
}

function drawTotalsBlock(
  ctx: PdfCtx,
  items: ManualInvoiceLineItem[],
  data: ManualInvoicePdfData,
) {
  const taxPercent = data.taxPercent ?? 0;
  const multi = data.currency === 'MIX' || new Set(items.map((l) => l.currency)).size > 1;
  const blocks = multi
    ? [...computeTotalsByCurrency(items, taxPercent).entries()]
    : [[
        data.currency || items[0]?.currency || 'EUR',
        {
          subtotalCents: data.amountCents || items.reduce((s, l) => s + l.amountCents, 0),
          taxCents: data.taxCents ?? 0,
          totalCents: data.totalCents ?? 0,
        },
      ]] as [string, { subtotalCents: number; taxCents: number; totalCents: number }][];

  if (!multi && blocks[0]) {
    const [, t] = blocks[0];
    if (!t.taxCents && taxPercent) {
      t.taxCents = Math.round(t.subtotalCents * (taxPercent / 100));
      t.totalCents = t.subtotalCents + t.taxCents;
    }
  }

  drawSectionTitle(ctx, 'Resumen de valores');

  for (const [currency, t] of blocks) {
    const taxCents = t.taxCents || Math.round(t.subtotalCents * (taxPercent / 100));
    const totalCents = t.totalCents || t.subtotalCents + taxCents;
    const rows: Array<[string, string, string, string]> = [
      ['MONEDA:', currency, 'SUB TOTAL:', formatAmount(t.subtotalCents, currency)],
      ['BASE GRAVABLE:', formatAmount(t.subtotalCents, currency), `IVA ${taxPercent}%:`, formatAmount(taxCents, currency)],
      ['VALOR FACTURA:', formatAmount(totalCents, currency), '', ''],
    ];
    drawFieldGrid(ctx, rows);
  }
}

function drawAdditionalInfo(ctx: PdfCtx, items: ManualInvoiceLineItem[], data: ManualInvoicePdfData) {
  const notes = [
    ...items.map((l) => l.notes?.trim()).filter(Boolean),
    data.notes?.trim(),
    data.paymentRef?.trim() ? `Referencia: ${data.paymentRef}` : '',
    data.paymentMethod?.trim() ? `Medio de pago: ${data.paymentMethod}` : '',
  ].filter(Boolean) as string[];

  if (!notes.length) return;

  drawSectionTitle(ctx, 'Informacion Adicional');
  ensureSpace(ctx, 20 + notes.length * 12);
  const top = ctx.y;
  const boxH = 12 + notes.length * 12;
  ctx.page.drawRectangle({
    x: M,
    y: top - boxH,
    width: CONTENT_W,
    height: boxH,
    borderColor: ctx.border,
    borderWidth: 0.5,
  });
  let ny = top - 12;
  for (const n of notes.slice(0, 6)) {
    drawText(ctx, n, M + 6, ny, { size: 7, maxWidth: CONTENT_W - 12 });
    ny -= 12;
  }
  ctx.y = top - boxH - 6;
}

export async function buildManualInvoicePdf(data: ManualInvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.12, 0.12, 0.14);
  const muted = rgb(0.35, 0.35, 0.38);
  const border = rgb(0.55, 0.55, 0.58);
  const headerBg = rgb(0.93, 0.94, 0.96);

  const ctx: PdfCtx = {
    doc,
    page: doc.addPage([PAGE_W, PAGE_H]),
    font,
    fontBold,
    y: PAGE_H - M,
    black,
    muted,
    border,
    headerBg,
  };

  const items = resolveLineItems(data);
  const issued = data.issuedAt;

  // ── Encabezado ──
  drawText(ctx, 'FACTURA DE VENTA', M, ctx.y, { size: 14, bold: true });
  ctx.y -= 16;
  drawText(ctx, 'Documento de soporte — comprobante manual BotIvA', M, ctx.y, { size: 8, color: muted });
  ctx.y -= 14;
  drawHLine(ctx, ctx.y);
  ctx.y -= 12;

  drawSectionTitle(ctx, 'Datos del Documento');
  drawFieldGrid(ctx, [
    ['Numero de Factura:', data.invoiceNumber, 'Fecha de Generacion:', formatDateTime(issued)],
    ['Fecha de Expedicion:', formatDateTime(issued), 'Tipo de Operacion:', 'Estandar'],
    ['Tipo de Negociacion:', 'Contado', 'Medio de Pago:', data.paymentMethod?.trim() || 'Instrumento no definido'],
  ]);

  // ── Emisor ──
  drawSectionTitle(ctx, 'Datos del Emisor');
  drawFieldGrid(ctx, [
    ['Nit del Emisor:', data.issuer.taxId || '—', 'Razon Social:', data.issuer.name],
    ['Direccion:', data.issuer.address || '—', 'Correo:', data.issuer.email || '—'],
    ['Municipio:', data.issuer.city || '—', 'Departamento:', data.issuer.state || '—'],
    ['Telefono:', data.issuer.phone || '—', 'Regimen:', 'Impuesto sobre las ventas - IVA'],
  ]);

  // ── Adquiriente ──
  const buyerCity = [data.buyer.city, data.buyer.state].filter(Boolean).join(', ') || '—';
  drawSectionTitle(ctx, 'Datos del Adquiriente');
  drawFieldGrid(ctx, [
    ['Nit / Documento:', data.buyer.taxId || '—', 'Razon Social:', data.buyer.companyName || '—'],
    ['Direccion:', data.buyer.address || '—', 'Correo:', data.buyer.email || '—'],
    ['Municipio:', buyerCity, 'Pais:', data.buyer.country || '—'],
    ['Codigo Postal:', data.buyer.zipCode || '—', 'Tipo Contribuyente:', 'Persona Natural / Juridica'],
  ]);

  // ── Detalle ──
  drawSectionTitle(ctx, 'Detalle de productos / servicios');
  drawItemsTable(ctx, items, data.taxPercent ?? 0);

  drawAdditionalInfo(ctx, items, data);
  drawTotalsBlock(ctx, items, data);

  // ── Pie ──
  ensureSpace(ctx, 36);
  ctx.y = Math.min(ctx.y, 72);
  drawHLine(ctx, ctx.y);
  ctx.y -= 10;
  drawText(
    ctx,
    `Documento generado por ${BRAND_NAME}. Comprobante manual; no reemplaza factura electronica DIAN ni recibo LemonSqueezy cuando aplique.`,
    M,
    ctx.y,
    { size: 6.5, color: muted, maxWidth: CONTENT_W },
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
