/**
 * GET  /api/widgets          — list user's widgets
 * POST /api/widgets          — create widget (unique name per user, no plan limit)
 * DELETE /api/widgets?id=xxx — delete widget
 */

import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget, ClientAgent, User } from '@/lib/db/models';
import { verifySessionToken, isUserEmailVerified, isImpersonationSession } from '@/lib/auth';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  const widgets = await Widget.find({ userId }).sort({ createdAt: -1 }).lean();
  const agentIds = [...new Set(widgets.map((w) => w.agentId).filter(Boolean) as string[])];
  const nameByAgentId = new Map<string, string>();
  if (agentIds.length) {
    const agents = await ClientAgent.find({ _id: { $in: agentIds } })
      .select('_id name userId isPlatform')
      .lean();
    for (const a of agents) {
      const owner = String(a.userId) === String(userId);
      const platform = (a as { isPlatform?: boolean }).isPlatform === true;
      if (!owner && !platform) continue;
      nameByAgentId.set(String(a._id), typeof a.name === 'string' ? a.name : '');
    }
  }
  const widgetsOut = widgets.map((w) => ({
    ...w,
    agentName: nameByAgentId.get(String(w.agentId)) ?? null,
  }));
  return NextResponse.json({ widgets: widgetsOut });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();

  // ── Check email verified ──────────────────────────────────────────────────
  const user = await User.findById(userId).select({ emailVerified: 1 }).lean() as { emailVerified?: boolean } | null;
  if (!isImpersonationSession(req.cookies) && !isUserEmailVerified(user)) {
    return NextResponse.json(
      { error: 'Debes verificar tu correo electrónico antes de crear widgets.', code: 'EMAIL_NOT_VERIFIED' },
      { status: 403 },
    );
  }

  const body = await req.json() as Record<string, unknown>;

  // ── Unicidad: no dos widgets con el mismo nombre para el mismo usuario ────
  const nameStr = typeof body.name === 'string' ? body.name.trim() : '';
  if (!nameStr) {
    return NextResponse.json({ error: 'El nombre del widget es requerido.' }, { status: 400 });
  }
  const nameExists = await Widget.exists({ userId, name: nameStr });
  if (nameExists) {
    return NextResponse.json(
      { error: 'Ya tienes un widget con ese nombre. Usa un nombre diferente para crear uno nuevo.' },
      { status: 409 },
    );
  }
  const afhubToken =
    typeof body.afhubToken === 'string' && body.afhubToken.trim().startsWith('wt_')
      ? body.afhubToken.trim()
      : `wt_${randomBytes(24).toString('hex')}`;

  const { afhubToken: _ignoredToken, userId: _ignoredUid, name: _ignoredName, ...rest } = body;
  const widget = await Widget.create({ ...rest, name: nameStr, userId, afhubToken });
  return NextResponse.json({ widget }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido.' }, { status: 400 });

  await connectDB();
  await Widget.deleteOne({ _id: id, userId });
  return NextResponse.json({ ok: true });
}
