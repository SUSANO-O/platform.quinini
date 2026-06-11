/**
 * PATCH /api/admin/users/[userId]/landing-access-lock
 * { enabled?: boolean, regenerate?: boolean, accessCode?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { recordAudit } from '@/lib/audit-log';
import {
  generateLandingAccessCode,
  hashLandingAccessCode,
  isValidLandingAccessCodeFormat,
  normalizeLandingAccessCode,
} from '@/lib/landing-access-lock';

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const adminId = verifySessionToken(token);
  if (!adminId) return null;
  await connectDB();
  const admin = await User.findById(adminId).lean() as { role?: string } | null;
  return admin?.role === 'admin' ? adminId : null;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error('JWT_SECRET missing');
  return secret;
}

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { userId } = await params;
  let body: { enabled?: boolean; regenerate?: boolean; accessCode?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  await connectDB();
  const user = await User.findById(userId).lean() as {
    email?: string;
    role?: string;
    landingAccessLockEnabled?: boolean;
    landingAccessCode?: string | null;
    landingAccessCodeVersion?: number;
  } | null;

  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
  if (user.role === 'admin') {
    return NextResponse.json({ error: 'No aplica candado a cuentas admin.' }, { status: 403 });
  }

  const nextEnabled = typeof body.enabled === 'boolean'
    ? body.enabled
    : Boolean(user.landingAccessLockEnabled);

  let nextCode = user.landingAccessCode ?? null;
  let nextVersion = user.landingAccessCodeVersion ?? 0;
  let codeChanged = false;

  if (nextEnabled) {
    if (typeof body.accessCode === 'string' && body.accessCode.trim()) {
      const normalized = normalizeLandingAccessCode(body.accessCode);
      if (!isValidLandingAccessCodeFormat(normalized)) {
        return NextResponse.json(
          { error: 'Código inválido. Usa 4–12 caracteres (A-Z y 2-9, sin espacios).' },
          { status: 400 },
        );
      }
      nextCode = normalized;
      codeChanged = normalized !== (user.landingAccessCode ?? null);
    } else if (body.regenerate || !nextCode) {
      nextCode = generateLandingAccessCode();
      codeChanged = true;
    }
  }

  if (codeChanged) nextVersion += 1;

  const secret = getJwtSecret();
  const update: Record<string, unknown> = {
    landingAccessLockEnabled: nextEnabled,
    landingAccessCode: nextEnabled ? nextCode : null,
    landingAccessCodeHash: nextEnabled && nextCode
      ? hashLandingAccessCode(nextCode, userId, secret)
      : null,
    landingAccessCodeVersion: nextEnabled ? nextVersion : 0,
  };

  await User.updateOne({ _id: userId }, { $set: update });

  await recordAudit({
    userId: adminId,
    action: 'admin.landing_access_lock.update',
    resource: userId,
    meta: {
      targetEmail: user.email,
      enabled: nextEnabled,
      codeChanged,
    },
  });

  return NextResponse.json({
    ok: true,
    landingAccessLockEnabled: nextEnabled,
    landingAccessCode: nextEnabled ? nextCode : null,
    landingAccessCodeVersion: nextEnabled ? nextVersion : 0,
  });
}
