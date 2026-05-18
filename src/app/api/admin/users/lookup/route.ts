/**
 * GET /api/admin/users/lookup?q=<email|userId>
 * Admin only. Busca usuarios por email (parcial) o userId exacto.
 * Devuelve máx. 10 resultados para el autocomplete del filtro.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const uid = verifySessionToken(token);
  if (!uid) return null;
  await connectDB();
  const user = (await User.findById(uid).lean()) as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return uid;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  await connectDB();

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  type UserDoc = { _id: { toString(): string }; email?: string; displayName?: string };

  let users: UserDoc[] = [];

  if (q.includes('@')) {
    // Búsqueda por email — regex case-insensitive
    users = (await User.find(
      { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { _id: 1, email: 1, displayName: 1 },
    ).limit(10).lean()) as UserDoc[];
  } else if (/^[a-f0-9]{24}$/i.test(q)) {
    // ID exacto de MongoDB
    const u = (await User.findById(q, { _id: 1, email: 1, displayName: 1 }).lean()) as UserDoc | null;
    if (u) users = [u];
  } else {
    // Búsqueda por displayName o email parcial
    users = (await User.find(
      {
        $or: [
          { email:       { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
          { displayName: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
        ],
      },
      { _id: 1, email: 1, displayName: 1 },
    ).limit(10).lean()) as UserDoc[];
  }

  return NextResponse.json({
    users: users.map((u) => ({
      id: u._id.toString(),
      email: u.email ?? '',
      displayName: u.displayName ?? '',
    })),
  });
}
