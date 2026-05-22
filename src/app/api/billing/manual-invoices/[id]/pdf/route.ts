/**
 * GET /api/billing/manual-invoices/[id]/pdf — descarga PDF del recibo manual (propietario)
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { ManualInvoice } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { manualInvoicePdfResponse } from '@/lib/manual-invoice-pdf-response';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }
  await connectDB();

  const inv = await ManualInvoice.findById(id).lean();
  if (!inv || String(inv.userId) !== userId || inv.status !== 'issued') {
    return NextResponse.json({ error: 'Recibo no encontrado.' }, { status: 404 });
  }

  return manualInvoicePdfResponse(inv);
}
