import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { generateLsInvoicePdfUrl } from '@/lib/billing-user-data';

type Params = { params: Promise<{ userId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const { userId } = await params;
  const body = await req.json().catch(() => ({})) as { invoiceId?: string; kind?: string };

  const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId.trim() : '';
  const kind = body.kind === 'order' ? 'order' : body.kind === 'subscription' ? 'subscription' : null;

  if (!invoiceId || !kind) {
    return NextResponse.json({ error: 'invoiceId y kind (subscription|order) requeridos.' }, { status: 400 });
  }
  if (!/^(si_|o_)\d+$/.test(invoiceId)) {
    return NextResponse.json({ error: 'ID de factura inválido.' }, { status: 400 });
  }

  const downloadUrl = await generateLsInvoicePdfUrl(userId, invoiceId, kind);
  if (!downloadUrl) {
    return NextResponse.json(
      { error: 'No se pudo generar el recibo. Comprueba los datos fiscales del usuario.' },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, downloadUrl });
}
