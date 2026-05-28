/**
 * POST /api/share/[shareId]/auth { password }
 * Valida la contraseña del share y crea una cookie de sesión (72 h).
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db/connection';
import { WidgetShare } from '@/lib/db/models';
import { createShareSessionToken } from '@/lib/auth';

type Ctx = { params: Promise<{ shareId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { shareId } = await params;

  let password: string;
  try {
    const body = await req.json() as { password?: string };
    password = typeof body.password === 'string' ? body.password.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: 'Contraseña requerida.' }, { status: 400 });
  }

  await connectDB();

  const share = await WidgetShare.findOne({ shareId, active: true })
    .select({ passwordHash: 1, widgetId: 1 })
    .lean() as { passwordHash: string; widgetId: string } | null;

  if (!share) {
    return NextResponse.json({ error: 'Enlace no válido o desactivado.' }, { status: 404 });
  }

  const valid = await bcrypt.compare(password, share.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 });
  }

  const sessionToken = createShareSessionToken(shareId);

  const res = NextResponse.json({ ok: true, widgetId: share.widgetId });
  res.cookies.set('share_session', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 72 * 60 * 60,
  });
  return res;
}
