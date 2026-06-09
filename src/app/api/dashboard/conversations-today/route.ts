/**
 * GET /api/dashboard/conversations-today?from=&to=
 * Devuelve métricas del periodo alineadas con facturación (RequestLog):
 * - count / billableTurns: respuestas AI (≈ cada +1 en "Uso del mes")
 * - sessionsStarted: chats nuevos (primer mensaje en el rango)
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import {
  countUserBillableTurnsInRange,
  countUserConversationsStartedInRange,
} from '@/lib/conversation-metrics';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  try {
    await connectDB();
    const url = new URL(req.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');

    let from: Date;
    let to: Date | null = null;
    if (fromParam) {
      from = new Date(fromParam);
      if (isNaN(from.getTime())) return NextResponse.json({ error: 'from inválido.' }, { status: 400 });
      if (toParam) {
        to = new Date(toParam);
        if (isNaN(to.getTime())) return NextResponse.json({ error: 'to inválido.' }, { status: 400 });
      }
    } else {
      const COL = 5 * 60 * 60 * 1000;
      const nowCo = new Date(Date.now() - COL);
      const y = nowCo.getUTCFullYear();
      const m = nowCo.getUTCMonth();
      const d = nowCo.getUTCDate();
      from = new Date(Date.UTC(y, m, d) + COL);
    }

    const [billableTurns, sessionsStarted] = await Promise.all([
      countUserBillableTurnsInRange(userId, from, to),
      countUserConversationsStartedInRange(userId, from, to),
    ]);
    return NextResponse.json({
      count: billableTurns,
      billableTurns,
      sessionsStarted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[conversations-today]', msg);
    return NextResponse.json({ error: 'No se pudo obtener.' }, { status: 500 });
  }
}
