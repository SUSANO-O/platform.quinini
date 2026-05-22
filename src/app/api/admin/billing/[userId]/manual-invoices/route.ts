import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createManualInvoice, listManualInvoices } from '@/lib/billing-user-data';

type Params = { params: Promise<{ userId: string }> };

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
      amountCents: inv.amountCents,
      taxCents: inv.taxCents,
      totalCents: inv.totalCents,
      currency: inv.currency,
      taxPercent: inv.taxPercent,
      paymentMethod: inv.paymentMethod || '',
      paymentRef: inv.paymentRef || '',
      status: inv.status,
    })),
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const { userId } = await params;
  const body = await req.json().catch(() => ({})) as {
    concept?: string;
    amount?: number;
    currency?: string;
    taxPercent?: number;
    issuedAt?: string;
    paymentMethod?: string;
    paymentRef?: string;
    notes?: string;
  };

  const concept = typeof body.concept === 'string' ? body.concept.trim() : '';
  const amount = typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount ?? ''));
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'EUR';
  const taxPercent = Math.min(100, Math.max(0, typeof body.taxPercent === 'number' ? body.taxPercent : 0));

  if (!concept || concept.length < 3) {
    return NextResponse.json({ error: 'Indica un concepto (mín. 3 caracteres).' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Importe inválido.' }, { status: 400 });
  }
  if (!['EUR', 'USD', 'COP', 'GBP', 'MXN'].includes(currency)) {
    return NextResponse.json({ error: 'Moneda no soportada.' }, { status: 400 });
  }

  let issuedAt = new Date();
  if (body.issuedAt) {
    const parsed = new Date(body.issuedAt);
    if (!Number.isNaN(parsed.getTime())) issuedAt = parsed;
  }

  const result = await createManualInvoice(userId, {
    concept,
    amount,
    currency,
    taxPercent,
    issuedAt,
    paymentMethod: typeof body.paymentMethod === 'string' ? body.paymentMethod.trim() : '',
    paymentRef: typeof body.paymentRef === 'string' ? body.paymentRef.trim() : '',
    notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '',
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
