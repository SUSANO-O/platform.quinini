/**
 * GET /api/user/onboarding-journey — estado persistido del camino trial (dashboard).
 * PATCH — guardar progreso (done, última ruta, resume del driver).
 * DELETE — borrar estado (p. ej. reinicio del camino).
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';

const STAGE_IDS = [
  'inicio',
  'crear-agente',
  'mis-agentes',
  'mcp',
  'widget-builder',
  'mis-widgets',
  'ajustes',
] as const;

type StageId = (typeof STAGE_IDS)[number];

const STAGE_SET = new Set<string>(STAGE_IDS);

type StoredJourney = {
  v: 2;
  done: Partial<Record<StageId, boolean>>;
  lastPathname: string | null;
  lastTourResume: {
    v: 1;
    stage: string;
    stepIndex: number;
    route: string;
  } | null;
  updatedAt: string;
};

function sessionUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

function sanitizeDone(raw: unknown): Partial<Record<StageId, boolean>> {
  const out: Partial<Record<StageId, boolean>> = {};
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  for (const id of STAGE_IDS) {
    if (o[id] === true) out[id] = true;
  }
  return out;
}

function sanitizePathname(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t.startsWith('/')) return null;
  return t.slice(0, 240);
}

function sanitizeTourResume(raw: unknown): StoredJourney['lastTourResume'] {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.stage !== 'string' || !STAGE_SET.has(o.stage)) return null;
  if (typeof o.stepIndex !== 'number' || !Number.isFinite(o.stepIndex) || o.stepIndex < 0) return null;
  if (typeof o.route !== 'string' || !o.route.startsWith('/')) return null;
  return {
    v: 1,
    stage: o.stage,
    stepIndex: Math.floor(o.stepIndex),
    route: o.route.slice(0, 240),
  };
}

export async function GET(req: NextRequest) {
  const userId = sessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
  }

  try {
    await connectDB();
    const user = await User.findById(userId).select({ onboardingJourney: 1 }).lean() as {
      onboardingJourney?: unknown;
    } | null;
    if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

    const j = user.onboardingJourney;
    if (!j || typeof j !== 'object') {
      return NextResponse.json({ journey: null });
    }
    const o = j as Record<string, unknown>;
    if (o.v !== 2) {
      return NextResponse.json({ journey: null });
    }

    const journey: StoredJourney = {
      v: 2,
      done: sanitizeDone(o.done),
      lastPathname: sanitizePathname(o.lastPathname),
      lastTourResume: sanitizeTourResume(o.lastTourResume),
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date(0).toISOString(),
    };

    return NextResponse.json({ journey });
  } catch (e) {
    console.error('[onboarding-journey GET]', e);
    return NextResponse.json({ error: 'Error al leer el estado.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const userId = sessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const journey: StoredJourney = {
    v: 2,
    done: sanitizeDone(b.done),
    lastPathname: sanitizePathname(b.lastPathname),
    lastTourResume: sanitizeTourResume(b.lastTourResume),
    updatedAt: new Date().toISOString(),
  };

  try {
    await connectDB();
    const res = await User.updateOne({ _id: userId }, { $set: { onboardingJourney: journey } });
    if (res.matchedCount === 0) {
      return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, journey });
  } catch (e) {
    console.error('[onboarding-journey PATCH]', e);
    return NextResponse.json({ error: 'Error al guardar.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = sessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
  }

  try {
    await connectDB();
    await User.updateOne({ _id: userId }, { $unset: { onboardingJourney: '' } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[onboarding-journey DELETE]', e);
    return NextResponse.json({ error: 'Error al borrar.' }, { status: 500 });
  }
}
