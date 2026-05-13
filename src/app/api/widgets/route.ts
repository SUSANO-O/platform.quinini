/**
 * GET  /api/widgets          — list user's widgets
 * POST /api/widgets          — create widget (checks plan limit)
 * DELETE /api/widgets?id=xxx — delete widget
 */

import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget, Subscription, ClientAgent } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { WIDGET_LIMITS } from '@/lib/agent-plans';

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

  // ── Check plan limit ──────────────────────────────────────────────────────
  const sub = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string } | null;
  const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
  const maxWidgets = WIDGET_LIMITS[plan] ?? 1;

  const existingCount = await Widget.countDocuments({ userId });
  if (existingCount >= maxWidgets) {
    return NextResponse.json(
      { error: `Tu plan ${plan} permite máximo ${maxWidgets} widget${maxWidgets !== 1 ? 's' : ''}. Actualiza tu suscripción para crear más.` },
      { status: 403 },
    );
  }

  const body = await req.json() as Record<string, unknown>;
  const afhubToken =
    typeof body.afhubToken === 'string' && body.afhubToken.trim().startsWith('wt_')
      ? body.afhubToken.trim()
      : `wt_${randomBytes(24).toString('hex')}`;

  const { afhubToken: _ignoredToken, userId: _ignoredUid, ...rest } = body;
  const widget = await Widget.create({ ...rest, userId, afhubToken });
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
