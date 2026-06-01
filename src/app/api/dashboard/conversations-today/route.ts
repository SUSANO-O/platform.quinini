/**
 * GET /api/dashboard/conversations-today
 * Cuenta las conversaciones (sesiones de chat) iniciadas hoy por el usuario.
 * Excluye las entradas de inbox (handoff, sessionId ho_*) para no duplicar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession } from '@/lib/db/models';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  try {
    await connectDB();
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const count = await ConversationSession.countDocuments({
      userId,
      startedAt: { $gte: start },
      sessionId: { $not: /^ho_/ }, // ho_* son entradas de inbox, no chats nuevos
    });

    return NextResponse.json({ count });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[conversations-today]', msg);
    return NextResponse.json({ error: 'No se pudo obtener.' }, { status: 500 });
  }
}
