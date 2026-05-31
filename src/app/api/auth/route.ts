/**
 * POST /api/auth  { action: 'register' | 'login' | 'logout', email?, password?, displayName? }
 * GET  /api/auth  (reads session cookie → returns current user)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription, RegistrationCode } from '@/lib/db/models';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  generateSecureToken,
  validatePasswordStrength,
  createTwoFactorPendingToken,
  IMPERSONATOR_COOKIE,
} from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { sendVerificationEmail } from '@/lib/email';
import { recordAudit } from '@/lib/audit-log';
import { resolveEnvRegistrationCode, normalizeTrialDays, DEFAULT_REGISTRATION_TRIAL_DAYS } from '@/lib/registration-codes-env';

const COOKIE = 'afhub_session';

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY ?? '';

async function verifyCaptcha(token: string | undefined, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true; // CAPTCHA desactivado en dev (sin clave)
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.set('secret', TURNSTILE_SECRET);
    form.set('response', token);
    form.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await res.json() as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
const COOKIE_MAX_AGE = 60 * 60 * 12; // 12 hours

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

// Evita que proxies/CDN cacheen respuestas de autenticación
function noCache(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

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
      const res = noCache(NextResponse.json({ ok: true }));
      res.cookies.set(COOKIE, '', { maxAge: 0, path: '/' });
      res.cookies.set(IMPERSONATOR_COOKIE, '', { maxAge: 0, path: '/' });
      return res;
    }

    const { email, password, displayName } = body;

    if (!email || !password) {
      return noCache(NextResponse.json({ error: 'Email y contraseña requeridos.' }, { status: 400 }));
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Register ──────────────────────────────────────────────────────────
    if (action === 'register') {
      if (!await verifyCaptcha(body.cfToken, ip)) {
        return noCache(NextResponse.json({ error: 'Verificación de seguridad fallida. Recarga e intenta de nuevo.' }, { status: 400 }));
      }

      // ── Código de autorización ────────────────────────────────────────
      const submittedCode = typeof body.registrationCode === 'string'
        ? body.registrationCode.trim().toUpperCase()
        : '';

      if (!submittedCode) {
        return noCache(NextResponse.json(
          { error: 'El código de autorización es requerido.' },
          { status: 403 },
        ));
      }

      const codeDoc = await RegistrationCode.findOne({ code: submittedCode }).lean() as {
        _id: { toString(): string };
        plan: string;
        active: boolean;
        maxUses: number;
        usedCount: number;
        trialDays?: number;
        expiresAt?: Date | null;
      } | null;

      let assignedPlan: string;
      let trialDays = DEFAULT_REGISTRATION_TRIAL_DAYS;
      let mongoCodeId: string | null = null;

      if (codeDoc) {
        if (!codeDoc.active) {
          return noCache(NextResponse.json(
            { error: 'Código de autorización inválido.' },
            { status: 403 },
          ));
        }
        if (codeDoc.expiresAt && new Date() > codeDoc.expiresAt) {
          return noCache(NextResponse.json(
            { error: 'El código de autorización ha expirado.' },
            { status: 403 },
          ));
        }
        if (codeDoc.usedCount >= codeDoc.maxUses) {
          return noCache(NextResponse.json(
            { error: 'El código de autorización ya no está disponible.' },
            { status: 403 },
          ));
        }
        assignedPlan = codeDoc.plan;
        trialDays = normalizeTrialDays(codeDoc.trialDays);
        mongoCodeId = codeDoc._id.toString();
      } else {
        const envEntry = resolveEnvRegistrationCode(submittedCode);
        if (!envEntry) {
          return noCache(NextResponse.json(
            { error: 'Código de autorización inválido.' },
            { status: 403 },
          ));
        }
        assignedPlan = envEntry.plan;
        trialDays = envEntry.trialDays;
      }

      // Rate limit: 5 registrations per hour per IP
      const rl = checkRateLimit('register', ip, 5, 60 * 60 * 1000);
      if (!rl.success) {
        return noCache(NextResponse.json(
          { error: `Demasiados registros. Intenta en ${rl.retryAfter}s.` },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
        ));
      }

      const pwError = validatePasswordStrength(password);
      if (pwError) {
        return noCache(NextResponse.json({ error: pwError }, { status: 400 }));
      }

      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) {
        return noCache(NextResponse.json({ error: 'El email ya está registrado.' }, { status: 409 }));
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

      // Marcar código Mongo como usado (los de REGISTRATION_CODES en .env no llevan contador)
      if (mongoCodeId) {
        await RegistrationCode.updateOne(
          { _id: mongoCodeId },
          {
            $inc: { usedCount: 1 },
            $push: { uses: { userId: user._id.toString(), email: normalizedEmail, usedAt: new Date() } },
          },
        );
      }

      // Asignar plan del código (periodo de prueba configurable por código)
      if (assignedPlan && assignedPlan !== 'free') {
        const now = Math.floor(Date.now() / 1000);
        const trialStartedAt = new Date();
        const trialEndsAt = new Date(trialStartedAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
        await Subscription.create({
          userId: user._id.toString(),
          plan: assignedPlan,
          status: 'trialing',
          trialStartedAt,
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd: Math.floor(trialEndsAt.getTime() / 1000),
        });
      }

      const emailResult = await sendVerificationEmail(normalizedEmail, user.displayName, verifyToken);
      if (!emailResult.ok) {
        console.error('[Register] Correo de verificación no enviado:', emailResult);
      }

      const token = createSessionToken(user._id.toString());
      await recordAudit({
        userId: user._id.toString(),
        action: 'auth.register',
        resource: 'session',
        ip,
      });
      const res = noCache(NextResponse.json({
        user: {
          uid: user._id.toString(),
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl ?? null,
          role: user.role || 'user',
          emailVerified: false,
        },
        message: emailResult.ok
          ? 'Cuenta creada. Te hemos enviado un correo de bienvenida con el enlace para confirmar tu correo.'
          : 'Cuenta creada, pero no pudimos enviar el correo de verificación. Revisa RESEND_API_KEY y EMAIL_FROM en el servidor (y el dominio en Resend), o pide un reenvío desde la página de verificación de correo.',
        emailSent: emailResult.ok,
        ...(emailResult.ok
          ? {}
          : {
              emailErrorCode: emailResult.code,
            }),
      }));
      setCookie(res, token);
      return res;
    }

    // ── Login ─────────────────────────────────────────────────────────────
    if (action === 'login') {
      if (!await verifyCaptcha(body.cfToken, ip)) {
        return noCache(NextResponse.json({ error: 'Verificación de seguridad fallida. Recarga e intenta de nuevo.' }, { status: 400 }));
      }

      // Rate limit: 10 attempts per 15 minutes per IP
      const rl = checkRateLimit('login', ip, 10, 15 * 60 * 1000);
      if (!rl.success) {
        return noCache(NextResponse.json(
          { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
        ));
      }

      // Also rate limit by email to prevent targeted attacks
      const emailRl = checkRateLimit('login-email', normalizedEmail, 10, 15 * 60 * 1000);
      if (!emailRl.success) {
        return noCache(NextResponse.json(
          { error: `Demasiados intentos para esta cuenta. Intenta en ${emailRl.retryAfter}s.` },
          { status: 429, headers: { 'Retry-After': String(emailRl.retryAfter) } },
        ));
      }

      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        await recordAudit({ userId: normalizedEmail, action: 'auth.login.failed', resource: 'session', ip, meta: { reason: 'user_not_found' } });
        return noCache(NextResponse.json(
          {
            error: 'No hay ninguna cuenta registrada con este email.',
            code: 'USER_NOT_REGISTERED',
          },
          { status: 404 },
        ));
      }

      const { valid, needsUpgrade } = await verifyPassword(password, user.passwordHash, user.hashVersion);
      if (!valid) {
        await recordAudit({ userId: user._id.toString(), action: 'auth.login.failed', resource: 'session', ip, meta: { reason: 'wrong_password' } });
        return noCache(NextResponse.json(
          { error: 'Contraseña incorrecta.', code: 'WRONG_PASSWORD' },
          { status: 401 },
        ));
      }

      // Upgrade SHA256 → bcrypt transparently on successful login
      if (needsUpgrade) {
        const newHash = await hashPassword(password);
        await User.updateOne({ _id: user._id }, { passwordHash: newHash, hashVersion: 'v2-bcrypt' });
      }

      // Si tiene 2FA activo → emitir token temporal (la sesión real se crea en /api/auth/2fa/complete)
      if (user.twoFactorEnabled) {
        const tempToken = createTwoFactorPendingToken(user._id.toString());
        return noCache(NextResponse.json({ requires2FA: true, tempToken }));
      }

      const token = createSessionToken(user._id.toString());
      await recordAudit({
        userId: user._id.toString(),
        action: 'auth.login',
        resource: 'session',
        ip,
      });
      const res = noCache(NextResponse.json({
        user: {
          uid: user._id.toString(),
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl ?? null,
          role: user.role || 'user',
          emailVerified: user.emailVerified ?? true, // treat legacy users as verified
          pendingEmail: user.pendingEmail ?? null,
        },
      }));
      setCookie(res, token);
      return res;
    }

    return noCache(NextResponse.json({ error: 'Acción no válida.' }, { status: 400 }));

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Auth] Error:', msg);
    return noCache(NextResponse.json({ error: 'Error interno.' }, { status: 500 }));
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return noCache(NextResponse.json({ user: null }));

  const userId = verifySessionToken(token);
  if (!userId) return noCache(NextResponse.json({ user: null }));

  await connectDB();
  try {
    const user = await User.findById(userId);
    if (!user) return noCache(NextResponse.json({ user: null }));

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

    return noCache(NextResponse.json({
      user: {
        uid: user._id.toString(),
        email: user.email,
        role: user.role || 'user',
        displayName: user.displayName,
        avatarUrl: user.avatarUrl ?? null,
        emailVerified: user.emailVerified ?? true,
        pendingEmail: user.pendingEmail ?? null,
        ...(impersonation ? { impersonation } : {}),
      },
    }));
  } catch {
    return noCache(NextResponse.json({ user: null }));
  }
}
