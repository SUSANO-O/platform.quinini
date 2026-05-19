/**
 * PATCH  /api/admin/registration-codes/[id]  — activar / desactivar / editar nota
 * DELETE /api/admin/registration-codes/[id]  — eliminar código
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { User, RegistrationCode } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  await connectDB();
  const user = await User.findById(userId).lean() as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return userId;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });

  const $set: Record<string, unknown> = {};
  if (typeof body.active === 'boolean') $set.active = body.active;
  if (typeof body.note === 'string')    $set.note   = body.note.trim().slice(0, 120);
  if (typeof body.maxUses === 'number') $set.maxUses = Math.max(1, Math.min(1000, body.maxUses));

  if (Object.keys($set).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  await connectDB();
  const res = await RegistrationCode.updateOne({ _id: id }, { $set });
  if (res.matchedCount === 0) {
    return NextResponse.json({ error: 'Código no encontrado.' }, { status: 404 });
  }

  const updated = await RegistrationCode.findById(id).lean();
  return NextResponse.json({ code: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  await connectDB();
  const res = await RegistrationCode.deleteOne({ _id: id });
  if (res.deletedCount === 0) {
    return NextResponse.json({ error: 'Código no encontrado.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
