/**
 * DELETE /api/admin/users/[userId]/2fa  → desactiva 2FA del usuario (soporte admin)
 * GET    /api/admin/users/[userId]/2fa  → estado actual del 2FA del usuario
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { recordAudit } from '@/lib/audit-log';

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const adminId = verifySessionToken(token);
  if (!adminId) return null;
  await connectDB();
  const admin = await User.findById(adminId).lean() as { role?: string } | null;
  return admin?.role === 'admin' ? adminId : null;
}

type Params = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { userId } = await params;
  await connectDB();
  const user = await User.findById(userId).lean() as { twoFactorEnabled?: boolean; email?: string } | null;
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  return NextResponse.json({ twoFactorEnabled: user.twoFactorEnabled ?? false, email: user.email });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { userId } = await params;
  await connectDB();

  const user = await User.findById(userId).lean() as { email?: string; twoFactorEnabled?: boolean } | null;
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  await User.updateOne({ _id: userId }, { twoFactorEnabled: false, twoFactorSecret: null });

  await recordAudit({
    userId: adminId,
    action: 'admin.2fa.reset',
    resource: userId,
    meta: { targetEmail: user.email },
  });

  return NextResponse.json({ ok: true });
}
