/**
 * POST /api/widgets/[id]/ticket
 *
 * Crea un ticket de soporte en Slack desde el formulario "Abrir ticket" del widget
 * (botón dedicado, sin pasar por el LLM). Reenvía a AIBackHub, que usa la conexión
 * Slack ya configurada en el agente (misma que usa el chat vía slack_create_ticket).
 *
 * Body: { sessionId?, agentId, contactInfo: { name, email }, description, imageUrls?, videoUrl?, token? }
 * Header opcional: X-Widget-Token (wt_*)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget } from '@/lib/db/models';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';
import { getAibackhubBaseUrl, hubCreateHeaders, hubFetch } from '@/lib/aibackhub-sync';

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    sessionId?: string;
    agentId?: string;
    contactInfo?: { name?: string; email?: string };
    description?: string;
    imageUrls?: string[];
    videoUrl?: string;
    token?: string;
  };

  await connectDB();

  const widget = await Widget.findById(id)
    .select({ userId: 1, name: 1, afhubToken: 1, active: 1, handoffEnabled: 1 })
    .lean() as {
      userId?: string;
      name?: string;
      afhubToken?: string;
      active?: boolean;
      handoffEnabled?: boolean;
    } | null;

  if (!widget?.userId) {
    return withCors(req, NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 }));
  }
  if (widget.active === false) {
    return withCors(req, NextResponse.json({ error: 'Widget desactivado.' }, { status: 403 }));
  }
  if (widget.handoffEnabled === false) {
    return withCors(
      req,
      NextResponse.json({ error: 'La creación de tickets está desactivada en este widget.' }, { status: 403 }),
    );
  }

  const wtToken =
    req.headers.get('x-widget-token')?.trim() ||
    (typeof body.token === 'string' ? body.token.trim() : '');
  if (!wtToken || !wtToken.startsWith('wt_') || wtToken !== widget.afhubToken) {
    return withCors(req, NextResponse.json({ error: 'Token de widget inválido.' }, { status: 403 }));
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
  const name = body.contactInfo?.name?.trim() || '';
  const email = body.contactInfo?.email?.trim() || '';
  const description = body.description?.trim() || '';

  if (!agentId) {
    return withCors(req, NextResponse.json({ error: 'Falta agentId.' }, { status: 400 }));
  }
  if (!name || !email) {
    return withCors(req, NextResponse.json({ error: 'Nombre y email son requeridos.' }, { status: 400 }));
  }
  if (!description) {
    return withCors(req, NextResponse.json({ error: 'Falta descripción del problema.' }, { status: 400 }));
  }

  if (!getAibackhubBaseUrl()) {
    return withCors(
      req,
      NextResponse.json({ error: 'Servicio de tickets no disponible temporalmente.' }, { status: 503 }),
    );
  }

  const imageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter((u) => typeof u === 'string' && /^https:\/\//i.test(u)).slice(0, 5)
    : [];
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';

  try {
    const res = await hubFetch(
      '/api/mcp/widget-ticket',
      {
        method: 'POST',
        headers: hubCreateHeaders(),
        body: JSON.stringify({
          agentId,
          title: description.slice(0, 80),
          description,
          requesterName: name,
          requesterEmail: email,
          imageUrls,
          ...(videoUrl ? { videoUrl } : {}),
        }),
      },
      20_000,
    );
    const json = await res.json().catch(() => ({})) as {
      success?: boolean;
      data?: { ticketId?: string; url?: string; status?: string };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      return withCors(
        req,
        NextResponse.json(
          { error: json.error?.message || 'No se pudo crear el ticket.' },
          { status: res.status === 503 ? 503 : 502 },
        ),
      );
    }
    return withCors(
      req,
      NextResponse.json({
        ok: true,
        ticketId: json.data?.ticketId,
        url: json.data?.url,
        message: 'Ticket creado. Nuestro equipo te contactará pronto.',
      }),
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('[widgets/ticket]', reason);
    return withCors(req, NextResponse.json({ error: 'No se pudo crear el ticket.' }, { status: 502 }));
  }
}
