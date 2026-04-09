/**
 * GET    /api/widgets/[id] — un widget del usuario
 * PATCH  /api/widgets/[id] — actualizar configuración (no token ni userId)
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { Widget } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

const PATCHABLE = [
  'name',
  'agentId',
  'color',
  'title',
  'subtitle',
  'welcome',
  'fabHint',
  'avatar',
  'position',
  'theme',
  'borderRadius',
  'autoOpen',
] as const;

type PatchableKey = (typeof PATCHABLE)[number];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(_req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  await connectDB();
  const widget = await Widget.findOne({ _id: id, userId }).lean();
  if (!widget) return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });

  return NextResponse.json({ widget });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const $set: Partial<Record<PatchableKey, unknown>> = {};

  for (const key of PATCHABLE) {
    if (!(key in raw)) continue;
    const v = raw[key];
    if (key === 'autoOpen') {
      $set.autoOpen = Boolean(v);
      continue;
    }
    if (key === 'theme') {
      if (v === 'light' || v === 'dark') $set.theme = v;
      continue;
    }
    if (typeof v === 'string') {
      if (key === 'name' || key === 'agentId') {
        const s = v.trim();
        if (!s) return NextResponse.json({ error: `${key} no puede estar vacío.` }, { status: 400 });
        $set[key] = s;
      } else {
        $set[key] = v;
      }
    }
  }

  if (Object.keys($set).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  await connectDB();
  const res = await Widget.updateOne({ _id: id, userId }, { $set });
  if (res.matchedCount === 0) {
    return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
  }

  const widget = await Widget.findOne({ _id: id, userId }).lean();
  return NextResponse.json({ widget });
}
