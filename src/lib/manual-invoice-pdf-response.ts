import { NextResponse } from 'next/server';
import { buildManualInvoicePdf, type InvoiceIssuer } from '@/lib/manual-invoice-pdf';
import { normalizeBillingProfile } from '@/lib/billing-profile';

type ManualInvoiceDoc = {
  invoiceNumber: string;
  issuedAt: Date | string;
  concept: string;
  amountCents: number;
  taxCents?: number | null;
  totalCents: number;
  currency?: string | null;
  taxPercent?: number | null;
  paymentMethod?: string | null;
  paymentRef?: string | null;
  notes?: string | null;
  buyer?: Record<string, unknown> | null;
  issuer?: InvoiceIssuer | null;
};

export async function manualInvoicePdfResponse(inv: ManualInvoiceDoc): Promise<NextResponse> {
  const buyer = normalizeBillingProfile(inv.buyer);
  const email =
    inv.buyer && typeof inv.buyer === 'object' && 'email' in inv.buyer
      ? String((inv.buyer as { email?: string }).email ?? '')
      : '';

  const issuerRaw = inv.issuer;
  const issuer: InvoiceIssuer = issuerRaw?.name
    ? issuerRaw
    : {
        name: 'BotIvA',
        taxId: '',
        address: '',
        city: '',
        email: 'facturacion@botiva.app',
      };

  const pdfBytes = await buildManualInvoicePdf({
    invoiceNumber: inv.invoiceNumber,
    issuedAt: inv.issuedAt instanceof Date ? inv.issuedAt : new Date(String(inv.issuedAt)),
    concept: inv.concept,
    amountCents: inv.amountCents,
    taxCents: inv.taxCents ?? 0,
    totalCents: inv.totalCents,
    currency: inv.currency || 'EUR',
    taxPercent: inv.taxPercent ?? 0,
    paymentMethod: inv.paymentMethod || '',
    paymentRef: inv.paymentRef || '',
    notes: inv.notes || '',
    buyer: { ...buyer, email },
    issuer,
  });

  const filename = `${inv.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
