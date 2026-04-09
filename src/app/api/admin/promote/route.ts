/**
 * POST /api/admin/promote
 * Body: { email, secret }
 * Promueve un usuario a admin. Protegido por ADMIN_SECRET en .env
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';

export async function POST(req: NextRequest) {
  const { email, secret } = await req.json();

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || secret !== adminSecret) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  await connectDB();
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    { role: 'admin' },
    { new: true }
  );

  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  return NextResponse.json({ ok: true, email: user.email, role: user.role });
}
