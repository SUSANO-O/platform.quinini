/**
 * DELETE /api/widgets/[id]/shares/[shareId]
 * Revoca un share específico (soft-delete: active = false).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Widget, WidgetShare } from '@/lib/db/models';

function authUser(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: Promise<{ id: string; shareId: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const userId = authUser(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id, shareId } = await params;
  await connectDB();

  const widget = await Widget.findOne({ _id: id, userId }).select({ _id: 1 }).lean();
  if (!widget) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  const result = await WidgetShare.updateOne(
    { shareId, widgetId: id, userId },
    { $set: { active: false } },
  );

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'Enlace no encontrado.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
