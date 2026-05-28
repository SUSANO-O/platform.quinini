/**
 * GET  /api/widgets/[id]/shares  — lista todos los shares del widget (activos, expirados y revocados)
 * POST /api/widgets/[id]/shares  — crea un nuevo share con duración configurable
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

  const widget = await Widget.findOne({ _id: id, userId }).select({ _id: 1, name: 1 }).lean() as { _id: unknown; name?: string } | null;
  if (!widget) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  const shares = await WidgetShare.find({ widgetId: id, userId })
    .select({ shareId: 1, label: 1, active: 1, expiresAt: 1, durationValue: 1, durationUnit: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .lean() as Array<{
      shareId: string; label: string; active: boolean;
      expiresAt: Date; durationValue: number; durationUnit: string; createdAt: Date;
    }>;

  const now = new Date();
  return NextResponse.json({
    widgetName: typeof widget.name === 'string' ? widget.name : 'Widget',
    shares: shares.map(s => ({
      shareId:       s.shareId,
      label:         s.label,
      active:        s.active,
      expired:       s.expiresAt ? s.expiresAt < now : false,
      expiresAt:     s.expiresAt,
      durationValue: s.durationValue,
      durationUnit:  s.durationUnit,
      createdAt:     s.createdAt,
    })),
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = authUser(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const widget = await Widget.findOne({ _id: id, userId }).select({ _id: 1, name: 1 }).lean() as { _id: unknown; name?: string } | null;
  if (!widget) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  let label         = '';
  let durationValue = 8;
  let durationUnit: 'hours' | 'days' | 'weeks' | 'months' = 'hours';
  try {
    const body = await req.json() as { label?: string; durationValue?: number; durationUnit?: string };
    label         = typeof body.label === 'string' ? body.label.trim().slice(0, 60) : '';
    durationValue = typeof body.durationValue === 'number' && body.durationValue > 0 ? Math.floor(body.durationValue) : 8;
    durationUnit  = ['hours', 'days', 'weeks', 'months'].includes(body.durationUnit ?? '') ? body.durationUnit as typeof durationUnit : 'hours';
  } catch { /* sin body */ }

  const shareId   = generateShareId();
  const plainPw   = generateSharePassword();
  const pwHash    = await hashPassword(plainPw);
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

  return NextResponse.json({ shareId, password: plainPw, expiresAt }, { status: 201 });
}
