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
import { withCors, handlePreflight } from '@/lib/cors';

/** Preflight CORS — el widget embebido en sitios externos hace POST aquí en modo humano. */
export async function OPTIONS(req: NextRequest) {
  return handlePreflight(req) ?? new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = (body?.token || req.headers.get('x-widget-token') || '').toString().trim();
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';

  // Adjuntos del visitante (ya subidos vía /api/widget/upload-attachment).
  const VALID_TYPES = ['image', 'video', 'file'];
  const VALID_RT = ['image', 'video', 'raw'];
  const attachments = Array.isArray(body?.attachments)
    ? (body.attachments as Array<Record<string, unknown>>)
        .filter((a) => a && typeof a.url === 'string' && /^https?:\/\//.test(a.url as string))
        .slice(0, 10)
        .map((a) => ({
          type: VALID_TYPES.includes(String(a.type)) ? String(a.type) : 'file',
          url: String(a.url),
          publicId: typeof a.publicId === 'string' ? a.publicId : '',
          resourceType: VALID_RT.includes(String(a.resourceType)) ? String(a.resourceType) : 'raw',
          name: typeof a.name === 'string' ? a.name.slice(0, 200) : '',
          mime: typeof a.mime === 'string' ? a.mime.slice(0, 120) : '',
          bytes: typeof a.bytes === 'number' && a.bytes >= 0 ? a.bytes : 0,
          width: typeof a.width === 'number' && a.width >= 0 ? a.width : 0,
          height: typeof a.height === 'number' && a.height >= 0 ? a.height : 0,
        }))
    : [];

  if (!token || !sessionId || (!content && attachments.length === 0)) {
    return withCors(req, NextResponse.json({ error: 'Faltan parámetros.' }, { status: 400 }));
  }

  await connectDB();

  const widget = await Widget.findOne({ afhubToken: token })
    .select({ _id: 1, userId: 1, agentId: 1, active: 1 })
    .lean() as { _id: unknown; userId?: unknown; agentId?: unknown; active?: boolean } | null;
  if (!widget || widget.active === false) {
    return withCors(req, NextResponse.json({ error: 'Token inválido.' }, { status: 401 }));
  }

  await WidgetMessage.create({
    widgetId: String(widget._id),
    userId: String(widget.userId || ''),
    agentId: widget.agentId ? String(widget.agentId) : '',
    sessionId,
    role: 'user',
    content: content.slice(0, 4000),
    attachments,
    traceId: `human-mode:${Date.now()}`,
  });

  return withCors(req, NextResponse.json({ ok: true }));
}
