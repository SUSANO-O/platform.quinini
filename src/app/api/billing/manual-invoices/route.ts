/**
 * GET  /api/billing/manual-invoices — listar recibos manuales
 * POST /api/billing/manual-invoices — crear recibo manual
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';

function authUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const userId = authUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  return NextResponse.json(
    { error: 'Los recibos manuales se gestionan desde el panel de administración.' },
    { status: 403 },
  );
}

export async function POST(req: NextRequest) {
  const userId = authUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  return NextResponse.json(
    { error: 'Los recibos manuales solo pueden crearse desde el panel de administración.' },
    { status: 403 },
  );
}
