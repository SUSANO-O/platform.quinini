/**
 * POST /api/admin/stop-impersonate
 * Restaura la sesión del administrador (requiere cookie de suplantación válida).
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import {
  createSessionToken,
  verifySessionToken,
  IMPERSONATOR_COOKIE,
} from '@/lib/auth';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function sessionCookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  };
}

export async function POST(req: NextRequest) {
  const impTok = req.cookies.get(IMPERSONATOR_COOKIE)?.value;
  if (!impTok) {
    return NextResponse.json({ error: 'No hay suplantación activa.' }, { status: 400 });
  }

  const adminId = verifySessionToken(impTok);
  if (!adminId) {
    const res = NextResponse.json({ error: 'Sesión de suplantación inválida.' }, { status: 401 });
    res.cookies.set(IMPERSONATOR_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  }

  await connectDB();
  const admin = await User.findById(adminId).lean() as { role?: string } | null;
  if (!admin || admin.role !== 'admin') {
    const res = NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    res.cookies.set(IMPERSONATOR_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('afhub_session', createSessionToken(adminId), sessionCookieOpts());
  res.cookies.set(IMPERSONATOR_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
