/**
 * GET  /api/auth/2fa/setup  → genera secreto TOTP + QR code (no activa 2FA todavía)
 * POST /api/auth/2fa/setup  { code } → verifica primer código y activa 2FA
 * DELETE /api/auth/2fa/setup { password } → desactiva 2FA (requiere contraseña)
 */

import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken, verifyPassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limit';
import { BRAND_NAME } from '@/lib/brand';

function noCache(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

function getUserIdFromRequest(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// GET — genera secreto temporal y devuelve QR code (no persiste todavía)
export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return noCache(NextResponse.json({ error: 'No autenticado.' }, { status: 401 }));

  await connectDB();
  const user = await User.findById(userId).lean() as { email: string; twoFactorEnabled?: boolean } | null;
  if (!user) return noCache(NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 }));

  if (user.twoFactorEnabled) {
    return noCache(NextResponse.json({ error: '2FA ya está activado.' }, { status: 400 }));
  }

  const secret = speakeasy.generateSecret({ length: 20 });
  const otpauthUrl = speakeasy.otpauthURL({
    secret: secret.base32,
    label: encodeURIComponent(user.email),
    issuer: BRAND_NAME,
    encoding: 'base32',
  });

  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Guardamos el secreto temporal en la sesión del usuario (no activo todavía)
  await User.updateOne({ _id: userId }, { twoFactorSecret: secret.base32 });

  return noCache(NextResponse.json({
    secret: secret.base32,
    qrCode: qrDataUrl,
  }));
}

// POST — verifica el primer código y activa 2FA
export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return noCache(NextResponse.json({ error: 'No autenticado.' }, { status: 401 }));

  const ip = getClientIp(req);
  await connectDB();

  const user = await User.findById(userId) as {
    _id: { toString(): string };
    email: string;
    twoFactorSecret?: string | null;
    twoFactorEnabled?: boolean;
    save(): Promise<void>;
  } | null;
  if (!user) return noCache(NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 }));
  if (user.twoFactorEnabled) return noCache(NextResponse.json({ error: '2FA ya está activado.' }, { status: 400 }));
  if (!user.twoFactorSecret) return noCache(NextResponse.json({ error: 'Inicia el proceso de configuración primero.' }, { status: 400 }));

  const { code } = await req.json() as { code?: string };
  if (!code || !/^\d{6}$/.test(code)) {
    return noCache(NextResponse.json({ error: 'El código debe ser de 6 dígitos.' }, { status: 400 }));
  }

  const valid = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: code,
    window: 1, // acepta ±30 segundos de drift
  });

  if (!valid) {
    return noCache(NextResponse.json({ error: 'Código incorrecto. Comprueba que la hora de tu dispositivo sea correcta.' }, { status: 400 }));
  }

  await User.updateOne({ _id: userId }, { twoFactorEnabled: true });
  await recordAudit({ userId: user._id.toString(), action: 'auth.2fa.enabled', resource: 'session', ip });

  return noCache(NextResponse.json({ ok: true }));
}

// DELETE — desactiva 2FA (requiere contraseña actual)
export async function DELETE(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return noCache(NextResponse.json({ error: 'No autenticado.' }, { status: 401 }));

  const ip = getClientIp(req);
  await connectDB();

  const user = await User.findById(userId) as {
    _id: { toString(): string };
    passwordHash: string;
    hashVersion: string;
    twoFactorEnabled?: boolean;
  } | null;
  if (!user) return noCache(NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 }));
  if (!user.twoFactorEnabled) return noCache(NextResponse.json({ error: '2FA no está activado.' }, { status: 400 }));

  const { password } = await req.json() as { password?: string };
  if (!password) return noCache(NextResponse.json({ error: 'La contraseña es requerida.' }, { status: 400 }));

  const { valid } = await verifyPassword(password, user.passwordHash, user.hashVersion);
  if (!valid) return noCache(NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 }));

  await User.updateOne({ _id: userId }, { twoFactorEnabled: false, twoFactorSecret: null });
  await recordAudit({ userId: user._id.toString(), action: 'auth.2fa.disabled', resource: 'session', ip });

  return noCache(NextResponse.json({ ok: true }));
}
