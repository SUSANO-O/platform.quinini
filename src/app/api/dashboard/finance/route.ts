/**
 * GET /api/dashboard/finance — uso facturable estimado por widget/mes (finance interno).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { buildFinanceSummary } from '@/lib/finance-aggregate';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  try {
    const summary = await buildFinanceSummary(userId);
    return NextResponse.json({
      ...summary,
      disclaimer:
        'Estimación interna basada en mensajes registrados en RequestLog × estimación por mensaje usando * + estimación por tipo de modelo usando *. No incluye coste real de proveedores de IA.',
    });
  } catch (e) {
    console.error('[finance]', e);
    return NextResponse.json({ error: 'No se pudo cargar el resumen.' }, { status: 500 });
  }
}
