import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createManualInvoice, listManualInvoices, type CreateManualInvoiceLineInput } from '@/lib/billing-user-data';
import { SUPPORTED_INVOICE_CURRENCIES } from '@/lib/manual-invoice-line';

type Params = { params: Promise<{ userId: string }> };

type RawLine = {
  concept?: string;
  amount?: number;
  currency?: string;
  notes?: string;
};

function parseLineItems(body: {
  lineItems?: RawLine[];
  taxPercent?: number;
  concept?: string;
  amount?: number;
  currency?: string;
  notes?: string;
}): { lines: CreateManualInvoiceLineInput[]; taxPercent: number } | { error: string } {
  const defaultCurrency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'USD';
  const taxPercent = Math.min(100, Math.max(0, typeof body.taxPercent === 'number' ? body.taxPercent : 0));

  const rawLines = Array.isArray(body.lineItems) && body.lineItems.length > 0
    ? body.lineItems
    : body.concept
      ? [{ concept: body.concept, amount: body.amount, currency: body.currency, notes: body.notes }]
      : [];

  if (!rawLines.length) {
    return { error: 'Indica al menos un concepto.' };
  }

  const lines: CreateManualInvoiceLineInput[] = [];
  for (const raw of rawLines) {
    const concept = typeof raw.concept === 'string' ? raw.concept.trim() : '';
    const amount = typeof raw.amount === 'number' ? raw.amount : parseFloat(String(raw.amount ?? ''));
    const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : defaultCurrency;

    if (!concept || concept.length < 2) {
      return { error: 'Cada concepto debe tener al menos 2 caracteres.' };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'Cada línea debe tener un importe válido mayor que 0.' };
    }
    if (!SUPPORTED_INVOICE_CURRENCIES.includes(currency as typeof SUPPORTED_INVOICE_CURRENCIES[number])) {
      return { error: `Moneda no soportada: ${currency}` };
    }

    lines.push({
      concept,
      amount,
      currency,
      notes: typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 2000) : '',
    });
  }

  return { lines, taxPercent };
}

export async function GET(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const { userId } = await params;
  const items = await listManualInvoices(userId);
  return NextResponse.json({
    items: items.map((inv) => ({
      id: String(inv._id),
      invoiceNumber: inv.invoiceNumber,
      issuedAt: inv.issuedAt,
      concept: inv.concept,
      lineItems: Array.isArray(inv.lineItems)
        ? inv.lineItems.map((l: Record<string, unknown>) => ({
            concept: l.concept,
            amountCents: l.amountCents,
            currency: l.currency,
            notes: l.notes || '',
          }))
        : [],
      amountCents: inv.amountCents,
      taxCents: inv.taxCents,
      totalCents: inv.totalCents,
      currency: inv.currency,
      taxPercent: inv.taxPercent,
      status: inv.status,
    })),
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const { userId } = await params;
  const body = await req.json().catch(() => ({})) as Parameters<typeof parseLineItems>[0];

  const parsed = parseLineItems(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await createManualInvoice(userId, {
    lineItems: parsed.lines,
    taxPercent: parsed.taxPercent,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    invoiceNumber: result.invoiceNumber,
    pdfUrl: `/api/admin/billing/${userId}/manual-invoices/${result.id}/pdf`,
  });
}
