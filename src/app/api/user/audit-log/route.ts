/**
 * GET /api/user/audit-log — últimas acciones registradas (cuenta).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { listAuditLogs } from '@/lib/audit-log';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 50)) : 50;

  try {
    const entries = await listAuditLogs(userId, limit);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error('[audit-log]', e);
    return NextResponse.json({ error: 'No se pudo cargar el historial.' }, { status: 500 });
  }
}
