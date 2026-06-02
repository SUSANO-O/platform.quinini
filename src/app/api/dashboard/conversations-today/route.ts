/**
 * GET /api/dashboard/conversations-today
 * Cuenta las conversaciones únicas iniciadas hoy por el usuario.
 *
 * Estrategia: cuenta sessionId distintos en `widgetmessages` (la fuente real
 * de mensajes intercambiados), no en `conversationsessions` que depende del
 * evento widget_opened y a veces no se registra. Si por alguna razón no hay
 * mensajes pero sí sesiones (raro), usamos esas como fallback.
 *
 * Excluye sesiones de inbox (sessionId ho_*) para no duplicar handoffs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, WidgetMessage } from '@/lib/db/models';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  try {
    await connectDB();
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    // Fuente principal: sessionIds únicos en mensajes reales de hoy
    const sessionIds = await WidgetMessage.distinct('sessionId', {
      userId,
      createdAt: { $gte: start },
    });

    const valid = (sessionIds as unknown[]).filter(
      (s): s is string => typeof s === 'string' && s.length > 0 && !s.startsWith('ho_'),
    );

    // Fallback (raro): si no hay mensajes registrados, contar sesiones formales
    if (valid.length === 0) {
      const fallback = await ConversationSession.countDocuments({
        userId,
        startedAt: { $gte: start },
        sessionId: { $not: /^ho_/ },
      });
      return NextResponse.json({ count: fallback });
    }

    return NextResponse.json({ count: valid.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[conversations-today]', msg);
    return NextResponse.json({ error: 'No se pudo obtener.' }, { status: 500 });
  }
}
