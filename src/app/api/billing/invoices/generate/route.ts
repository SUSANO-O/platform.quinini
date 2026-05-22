/**
 * POST /api/billing/invoices/generate
 * Body: { invoiceId: string, kind: 'subscription' | 'order' }
 * Genera URL de descarga PDF con datos fiscales del usuario.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { getPaymentService } from '@/lib/payment';
import { normalizeBillingProfile } from '@/lib/billing-profile';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    invoiceId?: string;
    kind?: string;
  };

  const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId.trim() : '';
  const kind = body.kind === 'order' ? 'order' : body.kind === 'subscription' ? 'subscription' : null;

  if (!invoiceId || !kind) {
    return NextResponse.json({ error: 'invoiceId y kind (subscription|order) requeridos.' }, { status: 400 });
  }

  if (!/^(si_|o_)\d+$/.test(invoiceId)) {
    return NextResponse.json({ error: 'ID de factura inválido.' }, { status: 400 });
  }

  await connectDB();
  const user = await User.findById(userId).select({ billingProfile: 1 }).lean();
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  const profile = normalizeBillingProfile(user.billingProfile);
  const paymentService = getPaymentService();
  const downloadUrl = await paymentService.generateInvoiceDownloadUrl(invoiceId, kind, profile);

  if (!downloadUrl) {
    return NextResponse.json(
      { error: 'No se pudo generar el recibo. Comprueba tus datos fiscales o inténtalo más tarde.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, downloadUrl });
}
