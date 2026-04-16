/**
 * PATCH /api/user/profile  { displayName?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, isUserEmailVerified, isImpersonationSession } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function PATCH(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit('user-profile', ip, 30, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: `Demasiados cambios. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  let body: { displayName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const raw = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (raw.length > 120) {
    return NextResponse.json({ error: 'El nombre es demasiado largo (máx. 120).' }, { status: 400 });
  }

  await connectDB();
  const existing = await User.findById(userId).select('emailVerified').lean() as
    | { emailVerified?: boolean | null }
    | null;
  if (!existing) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
  if (!isImpersonationSession(req.cookies) && !isUserEmailVerified(existing)) {
    return NextResponse.json(
      {
        error: 'Verifica tu correo antes de actualizar tu perfil.',
        code: 'EMAIL_NOT_VERIFIED',
      },
      { status: 403 },
    );
  }

  const displayName = raw.length > 0 ? raw : null;
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { displayName } },
    { new: true },
  ).lean() as { email?: string; displayName?: string | null; role?: string; emailVerified?: boolean } | null;

  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    user: {
      uid: userId,
      email: user.email,
      displayName: user.displayName,
      role: user.role || 'user',
      emailVerified: user.emailVerified ?? true,
    },
  });
}
