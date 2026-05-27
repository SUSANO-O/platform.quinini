/**
 * POST /api/auth/2fa/complete  { tempToken, code }
 * Completa el login cuando el usuario tiene 2FA activado.
 * El tempToken fue emitido por /api/auth tras verificar la contraseña.
 */

import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import {
  verifyTwoFactorPendingToken,
  createSessionToken,
  IMPERSONATOR_COOKIE,
} from '@/lib/auth';
import { recordAudit } from '@/lib/audit-log';
import { getClientIp, checkRateLimit } from '@/lib/rate-limit';

const COOKIE = 'afhub_session';
const COOKIE_MAX_AGE = 60 * 60 * 12;

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

function noCache(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // Rate limit: 5 intentos por IP cada 15 minutos
  const rl = checkRateLimit('2fa-complete', ip, 5, 15 * 60 * 1000);
  if (!rl.success) {
    return noCache(NextResponse.json(
      { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    ));
  }

  const { tempToken, code } = await req.json() as { tempToken?: string; code?: string };

  if (!tempToken) return noCache(NextResponse.json({ error: 'Token inválido.' }, { status: 400 }));
  if (!code || !/^\d{6}$/.test(code.replace(/\s/g, ''))) {
    return noCache(NextResponse.json({ error: 'El código debe ser de 6 dígitos.' }, { status: 400 }));
  }

  const userId = verifyTwoFactorPendingToken(tempToken);
  if (!userId) return noCache(NextResponse.json({ error: 'El enlace de verificación expiró. Vuelve a iniciar sesión.' }, { status: 401 }));

  await connectDB();
  const user = await User.findById(userId) as {
    _id: { toString(): string };
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    role: string;
    emailVerified?: boolean;
    pendingEmail?: string | null;
    twoFactorSecret?: string | null;
    twoFactorEnabled?: boolean;
  } | null;

  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return noCache(NextResponse.json({ error: 'Configuración de 2FA no válida.' }, { status: 400 }));
  }

  const valid = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: code.replace(/\s/g, ''),
    window: 1,
  });

  if (!valid) {
    await recordAudit({ userId: user._id.toString(), action: 'auth.2fa.failed', resource: 'session', ip });
    return noCache(NextResponse.json({ error: 'Código incorrecto o expirado.' }, { status: 401 }));
  }

  const sessionToken = createSessionToken(user._id.toString());
  await recordAudit({ userId: user._id.toString(), action: 'auth.login', resource: 'session', ip });

  const res = noCache(NextResponse.json({
    user: {
      uid: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      role: user.role || 'user',
      emailVerified: user.emailVerified ?? true,
      pendingEmail: user.pendingEmail ?? null,
    },
  }));

  res.cookies.set(COOKIE, sessionToken, { ...cookieBase, maxAge: COOKIE_MAX_AGE });
  res.cookies.set(IMPERSONATOR_COOKIE, '', { ...cookieBase, maxAge: 0 });
  return res;
}
