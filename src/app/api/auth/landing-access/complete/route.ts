/**
 * POST /api/auth/landing-access/complete  { tempToken, code }
 * Completa el login cuando la cuenta tiene candado de acceso landing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import {
  createLandingUnlockToken,
  createSessionToken,
  IMPERSONATOR_COOKIE,
  LANDING_UNLOCK_COOKIE,
  verifyLandingAccessPendingToken,
} from '@/lib/auth';
import { recordAudit } from '@/lib/audit-log';
import { getClientIp, checkRateLimit } from '@/lib/rate-limit';
import {
  normalizeLandingAccessCode,
  verifyLandingAccessCode,
} from '@/lib/landing-access-lock';

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

function userPayload(user: {
  _id: { toString(): string };
  email: string;
  displayName: string | null;
  avatarUrl?: string | null;
  role?: string;
  emailVerified?: boolean;
  pendingEmail?: string | null;
}) {
  return {
    uid: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    role: user.role || 'user',
    emailVerified: user.emailVerified ?? true,
    pendingEmail: user.pendingEmail ?? null,
  };
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit('landing-access-complete', ip, 8, 15 * 60 * 1000);
  if (!rl.success) {
    return noCache(NextResponse.json(
      { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    ));
  }

  const { tempToken, code } = await req.json() as { tempToken?: string; code?: string };
  if (!tempToken) return noCache(NextResponse.json({ error: 'Token inválido.' }, { status: 400 }));
  if (!code?.trim()) return noCache(NextResponse.json({ error: 'Ingresa el código de acceso.' }, { status: 400 }));

  const userId = verifyLandingAccessPendingToken(tempToken);
  if (!userId) {
    return noCache(NextResponse.json(
      { error: 'La verificación expiró. Vuelve a iniciar sesión.' },
      { status: 401 },
    ));
  }

  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) return noCache(NextResponse.json({ error: 'Configuración incompleta.' }, { status: 500 }));

  await connectDB();
  const user = await User.findById(userId) as {
    _id: { toString(): string };
    email: string;
    displayName: string | null;
    avatarUrl?: string | null;
    role?: string;
    emailVerified?: boolean;
    pendingEmail?: string | null;
    landingAccessLockEnabled?: boolean;
    landingAccessCodeHash?: string | null;
    landingAccessCodeVersion?: number;
  } | null;

  if (!user?.landingAccessLockEnabled) {
    return noCache(NextResponse.json({ error: 'Esta cuenta no requiere código de acceso.' }, { status: 400 }));
  }

  const valid = verifyLandingAccessCode(
    normalizeLandingAccessCode(code),
    user.landingAccessCodeHash,
    userId,
    secret,
  );

  if (!valid) {
    await recordAudit({
      userId,
      action: 'auth.landing_access.failed',
      resource: 'session',
      ip,
    });
    return noCache(NextResponse.json({ error: 'Código de acceso incorrecto.' }, { status: 401 }));
  }

  const version = user.landingAccessCodeVersion ?? 0;
  const sessionToken = createSessionToken(userId);
  const unlockToken = createLandingUnlockToken(userId, version);

  await recordAudit({ userId, action: 'auth.login', resource: 'session', ip, meta: { landingAccess: true } });

  const res = noCache(NextResponse.json({ user: userPayload(user) }));
  res.cookies.set(COOKIE, sessionToken, { ...cookieBase, maxAge: COOKIE_MAX_AGE });
  res.cookies.set(LANDING_UNLOCK_COOKIE, unlockToken, { ...cookieBase, maxAge: COOKIE_MAX_AGE });
  res.cookies.set(IMPERSONATOR_COOKIE, '', { ...cookieBase, maxAge: 0 });
  return res;
}
