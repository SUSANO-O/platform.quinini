/**
 * POST /api/admin/impersonate  { targetUserId }
 * Solo administradores. Establece sesión como el usuario indicado y guarda cookie de auditoría.
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import {
  createSessionToken,
  verifySessionToken,
  IMPERSONATOR_COOKIE,
} from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';

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

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  await connectDB();
  const user = await User.findById(userId).lean() as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return userId;
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  // 20 intentos por admin por hora — limita iteración de userIds si la sesión de admin se compromete
  const rl = checkRateLimit('admin-impersonate', adminId, 20, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Demasiados cambios de sesión. Espera antes de volver a intentarlo.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const body = (await req.json().catch(() => null)) as { targetUserId?: string } | null;
  const raw = typeof body?.targetUserId === 'string' ? body.targetUserId.trim() : '';
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) {
    return NextResponse.json({ error: 'targetUserId inválido.' }, { status: 400 });
  }

  if (raw === adminId) {
    return NextResponse.json({ error: 'No puedes suplantarte a ti mismo.' }, { status: 400 });
  }

  await connectDB();
  const target = await User.findById(raw).lean() as { role?: string } | null;
  if (!target) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
  if (target.role === 'admin') {
    return NextResponse.json({ error: 'No se puede suplantar a otro administrador.' }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('afhub_session', createSessionToken(raw), sessionCookieOpts());
  res.cookies.set(IMPERSONATOR_COOKIE, createSessionToken(adminId), sessionCookieOpts());
  return res;
}
