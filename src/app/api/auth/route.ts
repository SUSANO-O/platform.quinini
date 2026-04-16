/**
 * POST /api/auth  { action: 'register' | 'login' | 'logout', email?, password?, displayName? }
 * GET  /api/auth  (reads session cookie → returns current user)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  generateSecureToken,
  IMPERSONATOR_COOKIE,
} from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { sendVerificationEmail } from '@/lib/email';

const COOKIE = 'afhub_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

function setCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    ...cookieBase,
    maxAge: COOKIE_MAX_AGE,
  });
  res.cookies.set(IMPERSONATOR_COOKIE, '', { ...cookieBase, maxAge: 0 });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  await connectDB();

  try {
    const body = await req.json();
    const { action } = body;

    // ── Logout ────────────────────────────────────────────────────────────
    if (action === 'logout') {
      const res = NextResponse.json({ ok: true });
      res.cookies.set(COOKIE, '', { maxAge: 0, path: '/' });
      res.cookies.set(IMPERSONATOR_COOKIE, '', { maxAge: 0, path: '/' });
      return res;
    }

    const { email, password, displayName } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos.' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Register ──────────────────────────────────────────────────────────
    if (action === 'register') {
      // Rate limit: 5 registrations per hour per IP
      const rl = checkRateLimit('register', ip, 5, 60 * 60 * 1000);
      if (!rl.success) {
        return NextResponse.json(
          { error: `Demasiados registros. Intenta en ${rl.retryAfter}s.` },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
        );
      }

      if (password.length < 8) {
        return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
      }

      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) {
        return NextResponse.json({ error: 'El email ya está registrado.' }, { status: 409 });
      }

      const passwordHash = await hashPassword(password);

      // Generate email verification token (valid 24h)
      const verifyToken = generateSecureToken();
      const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const user = await User.create({
        email: normalizedEmail,
        passwordHash,
        hashVersion: 'v2-bcrypt',
        displayName: displayName || normalizedEmail.split('@')[0],
        emailVerified: false,
        verifyToken,
        verifyTokenExpiry,
      });

      // Send verification email (non-blocking)
      sendVerificationEmail(normalizedEmail, user.displayName, verifyToken).catch((err) =>
        console.error('[Register] Email send failed:', err),
      );

      const token = createSessionToken(user._id.toString());
      const res = NextResponse.json({
        user: {
          uid: user._id.toString(),
          email: user.email,
          displayName: user.displayName,
          role: user.role || 'user',
          emailVerified: false,
        },
        message:
          'Cuenta creada. Te hemos enviado un correo de bienvenida con el enlace para confirmar tu correo.',
      });
      setCookie(res, token);
      return res;
    }

    // ── Login ─────────────────────────────────────────────────────────────
    if (action === 'login') {
      // Rate limit: 10 attempts per 15 minutes per IP
      const rl = checkRateLimit('login', ip, 10, 15 * 60 * 1000);
      if (!rl.success) {
        return NextResponse.json(
          { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
        );
      }

      // Also rate limit by email to prevent targeted attacks
      const emailRl = checkRateLimit('login-email', normalizedEmail, 10, 15 * 60 * 1000);
      if (!emailRl.success) {
        return NextResponse.json(
          { error: `Demasiados intentos para esta cuenta. Intenta en ${emailRl.retryAfter}s.` },
          { status: 429, headers: { 'Retry-After': String(emailRl.retryAfter) } },
        );
      }

      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 });
      }

      const { valid, needsUpgrade } = await verifyPassword(password, user.passwordHash, user.hashVersion);
      if (!valid) {
        return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 });
      }

      // Upgrade SHA256 → bcrypt transparently on successful login
      if (needsUpgrade) {
        const newHash = await hashPassword(password);
        await User.updateOne({ _id: user._id }, { passwordHash: newHash, hashVersion: 'v2-bcrypt' });
      }

      const token = createSessionToken(user._id.toString());
      const res = NextResponse.json({
        user: {
          uid: user._id.toString(),
          email: user.email,
          displayName: user.displayName,
          role: user.role || 'user',
          emailVerified: user.emailVerified ?? true, // treat legacy users as verified
          pendingEmail: user.pendingEmail ?? null,
        },
      });
      setCookie(res, token);
      return res;
    }

    return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Auth] Error:', msg);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ user: null });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ user: null });

  await connectDB();
  try {
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ user: null });

    let impersonation: { adminEmail: string; adminUid: string } | undefined;
    const impTok = req.cookies.get(IMPERSONATOR_COOKIE)?.value;
    if (impTok) {
      const adminUid = verifySessionToken(impTok);
      if (adminUid) {
        const adm = await User.findById(adminUid).lean() as { role?: string; email?: string } | null;
        if (adm?.role === 'admin') {
          impersonation = {
            adminUid,
            adminEmail: adm.email || '',
          };
        }
      }
    }

    return NextResponse.json({
      user: {
        uid: user._id.toString(),
        email: user.email,
        role: user.role || 'user',
        displayName: user.displayName,
        emailVerified: user.emailVerified ?? true,
        pendingEmail: user.pendingEmail ?? null,
        ...(impersonation ? { impersonation } : {}),
      },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
