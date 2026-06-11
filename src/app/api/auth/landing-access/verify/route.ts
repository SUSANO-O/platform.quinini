/**
 * POST /api/auth/landing-access/verify  { code }
 * Desbloquea el dashboard cuando ya hay sesión pero falta el código landing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import {
  createLandingUnlockToken,
  isImpersonationSession,
  LANDING_UNLOCK_COOKIE,
  verifySessionToken,
} from '@/lib/auth';
import { recordAudit } from '@/lib/audit-log';
import { getClientIp, checkRateLimit } from '@/lib/rate-limit';
import {
  normalizeLandingAccessCode,
  verifyLandingAccessCode,
} from '@/lib/landing-access-lock';

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
  const rl = checkRateLimit('landing-access-verify', ip, 8, 15 * 60 * 1000);
  if (!rl.success) {
    return noCache(NextResponse.json(
      { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    ));
  }

  const sessionToken = req.cookies.get('afhub_session')?.value;
  if (!sessionToken) return noCache(NextResponse.json({ error: 'Sesión requerida.' }, { status: 401 }));

  const userId = verifySessionToken(sessionToken);
  if (!userId) return noCache(NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }));

  if (isImpersonationSession(req.cookies)) {
    return noCache(NextResponse.json({ ok: true, bypassed: true }));
  }

  const { code } = await req.json() as { code?: string };
  if (!code?.trim()) return noCache(NextResponse.json({ error: 'Ingresa el código de acceso.' }, { status: 400 }));

  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) return noCache(NextResponse.json({ error: 'Configuración incompleta.' }, { status: 500 }));

  await connectDB();
  const user = await User.findById(userId).lean() as {
    landingAccessLockEnabled?: boolean;
    landingAccessCodeHash?: string | null;
    landingAccessCodeVersion?: number;
  } | null;

  if (!user?.landingAccessLockEnabled) {
    return noCache(NextResponse.json({ ok: true, notRequired: true }));
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
  const unlockToken = createLandingUnlockToken(userId, version);
  const res = noCache(NextResponse.json({ ok: true }));
  res.cookies.set(LANDING_UNLOCK_COOKIE, unlockToken, { ...cookieBase, maxAge: COOKIE_MAX_AGE });
  return res;
}
