/**
 * POST /api/widget/user-message
 * Guarda un mensaje del visitante SIN generar respuesta del AI.
 * Lo usa el widget mientras está en modo humano: el mensaje queda en la
 * transcripción para que el agente lo vea en el inbox (vía polling), pero el
 * bot no responde porque un humano está atendiendo.
 *
 * Auth: X-Widget-Token (wt_*).
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget, WidgetMessage } from '@/lib/db/models';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = (body?.token || req.headers.get('x-widget-token') || '').toString().trim();
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';

  if (!token || !sessionId || !content) {
    return NextResponse.json({ error: 'Faltan parámetros.' }, { status: 400 });
  }

  await connectDB();

  const widget = await Widget.findOne({ afhubToken: token })
    .select({ _id: 1, userId: 1, agentId: 1, active: 1 })
    .lean() as { _id: unknown; userId?: unknown; agentId?: unknown; active?: boolean } | null;
  if (!widget || widget.active === false) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }

  await WidgetMessage.create({
    widgetId: String(widget._id),
    userId: String(widget.userId || ''),
    agentId: widget.agentId ? String(widget.agentId) : '',
    sessionId,
    role: 'user',
    content: content.slice(0, 4000),
    traceId: `human-mode:${Date.now()}`,
  });

  return NextResponse.json({ ok: true });
}
