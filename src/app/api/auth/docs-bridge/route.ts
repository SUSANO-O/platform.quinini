/**
 * GET /api/auth/docs-bridge
 * Devuelve el token de sesión del landing para embeber /docs/ en agent-flow-api
 * (mismo JWT_SECRET en ambos servicios).
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Subscription } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { canUseApiAccess } from '@/lib/plan-catalog';

const COOKIE = 'afhub_session';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const userId = verifySessionToken(token);
  if (!userId) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
  }

  await connectDB();
  const sub = await Subscription.findOne({ userId }).lean() as {
    plan?: string;
    status?: string;
  } | null;

  const plan = sub?.plan ?? 'free';
  const status = sub?.status ?? 'free';
  if (!canUseApiAccess(plan, status)) {
    return NextResponse.json(
      { error: 'Plan Team o superior requerido para la documentación API' },
      { status: 403 },
    );
  }

  return NextResponse.json({ token });
}
