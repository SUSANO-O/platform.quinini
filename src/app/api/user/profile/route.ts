/**
 * PATCH /api/user/profile  { displayName?: string, avatarUrl?: string | null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, isUserEmailVerified, isImpersonationSession } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeUserAvatarUrl } from '@/lib/user-profile';

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

  let body: { displayName?: unknown; avatarUrl?: unknown; escalationWhatsAppPhone?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const update: Record<string, string | null> = {};

  if ('displayName' in body) {
    const raw = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    if (raw.length > 120) {
      return NextResponse.json({ error: 'El nombre es demasiado largo (máx. 120).' }, { status: 400 });
    }
    update.displayName = raw.length > 0 ? raw : null;
  }

  if ('avatarUrl' in body) {
    try {
      const normalized = normalizeUserAvatarUrl(body.avatarUrl);
      if (normalized !== undefined) update.avatarUrl = normalized;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Imagen inválida.' },
        { status: 400 },
      );
    }
  }

  if ('escalationWhatsAppPhone' in body) {
    const raw = typeof body.escalationWhatsAppPhone === 'string'
      ? body.escalationWhatsAppPhone.trim()
      : '';
    // Solo dígitos y + permitidos; máx 20 chars
    const cleaned = raw.replace(/[^\d+\s\-()]/g, '').trim();
    (update as Record<string, string | null>).escalationWhatsAppPhone = cleaned.length > 0 ? cleaned.slice(0, 20) : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
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

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true },
  ).lean() as {
    email?: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    role?: string;
    emailVerified?: boolean;
  } | null;

  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    user: {
      uid: userId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      role: user.role || 'user',
      emailVerified: user.emailVerified ?? true,
    },
  });
}
