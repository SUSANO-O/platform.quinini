/**
 * GET    /api/widgets/[id]/share   — obtiene el share activo del widget (si existe)
 * POST   /api/widgets/[id]/share   — crea un nuevo share (genera shareId + password)
 * DELETE /api/widgets/[id]/share   — revoca el share activo
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, hashPassword, generateShareId, generateSharePassword, computeShareExpiresAt } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Widget, WidgetShare } from '@/lib/db/models';

function authUser(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const userId = authUser(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const widget = await Widget.findOne({ _id: id, userId }).select({ _id: 1 }).lean();
  if (!widget) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  const share = await WidgetShare.findOne({ widgetId: id, userId, active: true })
    .select({ shareId: 1, label: 1, createdAt: 1 })
    .lean() as { shareId: string; label: string; createdAt: Date } | null;

  return NextResponse.json({ share: share ?? null });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = authUser(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const widget = await Widget.findOne({ _id: id, userId }).select({ _id: 1, name: 1 }).lean() as { _id: unknown; name?: string } | null;
  if (!widget) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  // Revocar share anterior si existe
  await WidgetShare.deleteMany({ widgetId: id, userId });

  const shareId  = generateShareId();
  const plainPw  = generateSharePassword();
  const pwHash   = await hashPassword(plainPw);

  let label         = '';
  let durationValue = 8;
  let durationUnit: 'hours' | 'days' | 'weeks' | 'months' = 'hours';
  try {
    const body = await req.json() as { label?: string; durationValue?: number; durationUnit?: string };
    label         = typeof body.label === 'string' ? body.label.trim().slice(0, 60) : '';
    durationValue = typeof body.durationValue === 'number' && body.durationValue > 0 ? Math.floor(body.durationValue) : 8;
    durationUnit  = ['hours', 'days', 'weeks', 'months'].includes(body.durationUnit ?? '') ? body.durationUnit as typeof durationUnit : 'hours';
  } catch { /* sin body */ }

  const expiresAt = computeShareExpiresAt(durationValue, durationUnit);

  await WidgetShare.create({
    widgetId: id,
    userId,
    shareId,
    passwordHash: pwHash,
    label: label || (typeof widget.name === 'string' ? widget.name : ''),
    active: true,
    expiresAt,
    durationValue,
    durationUnit,
  });

  return NextResponse.json({ shareId, password: plainPw, expiresAt });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const userId = authUser(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  await WidgetShare.deleteMany({ widgetId: id, userId });
  return NextResponse.json({ ok: true });
}
