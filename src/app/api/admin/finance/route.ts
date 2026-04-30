import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { buildAdminFinanceSummary, buildFinanceSummary } from '@/lib/finance-aggregate';

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  await connectDB();
  const user = await User.findById(userId).select({ role: 1 }).lean() as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return userId;
}

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const selectedUserId = req.nextUrl.searchParams.get('userId')?.trim() || '';

  try {
    const [overview, tenantDetail] = await Promise.all([
      buildAdminFinanceSummary(),
      selectedUserId ? buildFinanceSummary(selectedUserId) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ...overview,
      selectedUserId,
      tenantDetail,
      disclaimer:
        'Estimación interna basada en mensajes registrados en RequestLog × estimación por mensaje usando * + estimación por tipo de modelo usando *. No incluye coste real de proveedores de IA.',
    });
  } catch (e) {
    console.error('[admin/finance]', e);
    return NextResponse.json({ error: 'No se pudo cargar el panel financiero admin.' }, { status: 500 });
  }
}
