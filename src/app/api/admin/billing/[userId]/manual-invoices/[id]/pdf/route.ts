import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { ManualInvoice } from '@/lib/db/models';
import { requireAdmin } from '@/lib/admin-auth';
import { manualInvoicePdfResponse } from '@/lib/manual-invoice-pdf-response';

type Params = { params: Promise<{ userId: string; id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const { userId, id } = await params;
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
