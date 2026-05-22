import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { listLemonSqueezyInvoices } from '@/lib/billing-user-data';

type Params = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const { userId } = await params;
  try {
    const invoices = await listLemonSqueezyInvoices(userId);
    return NextResponse.json({ invoices });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[admin/billing/invoices]', msg);
    return NextResponse.json({ error: 'No se pudieron cargar las facturas.' }, { status: 500 });
  }
}
