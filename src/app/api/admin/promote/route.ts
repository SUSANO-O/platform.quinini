/**
 * POST /api/admin/promote
 * Body: { email, secret }
 * Promueve un usuario a admin.
 *
 * Requiere las dos cosas: sesión de un admin ya existente Y el ADMIN_SECRET. Antes bastaba el
 * secreto, así que cualquiera en internet podía probar secretos sin límite y hacerse admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { requireAdmin } from '@/lib/admin-auth';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';

/** Intentos por IP cada 15 min. */
const PROMOTE_ATTEMPTS_PER_WINDOW = 5;
const PROMOTE_WINDOW_MS = 15 * 60_000;

function secretMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimitAsync('admin-promote', getClientIp(req), PROMOTE_ATTEMPTS_PER_WINDOW, PROMOTE_WINDOW_MS);
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados intentos. Probá más tarde.' }, { status: 429 });
  }

  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; secret?: unknown };
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || !secretMatches(body.secret, adminSecret)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  if (!email) return NextResponse.json({ error: 'Email requerido.' }, { status: 400 });

  await connectDB();
  const user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { new: true });

  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  console.info('[admin/promote] promovido a admin', { by: adminId, userId: String(user._id) });
  return NextResponse.json({ ok: true, email: user.email, role: user.role });
}
