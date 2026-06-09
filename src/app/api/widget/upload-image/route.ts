/**
 * POST /api/widget/upload-image
 *
 * Sube una captura del widget a Cloudinary (server-side, mantiene el API secret seguro).
 * Body: { dataUrl, sessionId?, widgetId?, agentId?, token? }
 * Header: X-Widget-Token (wt_*)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { cloudinaryConfigured, uploadWidgetImage } from '@/lib/cloudinary';
import { findWidgetForWtToken, isWidgetActive, sentAgentIdMatchesWidget } from '@/lib/widget-token-verify';
import { isOriginAllowed } from '@/lib/widget-origin-check';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';

const MAX_DATA_URL_BYTES = 4 * 1024 * 1024;

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimitAsync('widget-upload-image', ip, 30, 60_000);
  if (!rl.success) {
    return withCors(
      req,
      NextResponse.json(
        { error: 'Demasiadas subidas. Intenta en unos segundos.', code: 'RATE_LIMITED' },
        { status: 429 },
      ),
    );
  }

  if (!cloudinaryConfigured()) {
    return withCors(
      req,
      NextResponse.json(
        {
          error: 'Subida de imágenes no configurada en el servidor.',
          code: 'CLOUDINARY_NOT_CONFIGURED',
        },
        { status: 503 },
      ),
    );
  }

  let body: {
    dataUrl?: string;
    sessionId?: string;
    widgetId?: string;
    agentId?: string;
    token?: string;
  };
  try {
    body = await req.json();
  } catch {
    return withCors(req, NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }));
  }

  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl.trim() : '';
  if (!dataUrl.startsWith('data:image/')) {
    return withCors(
      req,
      NextResponse.json({ error: 'Se requiere dataUrl de imagen válida.', code: 'INVALID_IMAGE' }, { status: 400 }),
    );
  }
  if (dataUrl.length > MAX_DATA_URL_BYTES) {
    return withCors(
      req,
      NextResponse.json({ error: 'Imagen demasiado grande (máx. ~4 MB).', code: 'IMAGE_TOO_LARGE' }, { status: 413 }),
    );
  }

  const widgetToken = (
    (req.headers.get('x-widget-token') || '').trim() ||
    (typeof body.token === 'string' ? body.token.trim() : '')
  ).trim();

  if (!widgetToken.startsWith('wt_')) {
    return withCors(
      req,
      NextResponse.json({ error: 'Token de widget requerido.', code: 'WIDGET_TOKEN_REQUIRED' }, { status: 401 }),
    );
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
  const widgetId = typeof body.widgetId === 'string' ? body.widgetId.trim() : '';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';

  await connectDB();
  const w = await findWidgetForWtToken(widgetToken, widgetId || undefined);
  if (!w) {
    return withCors(req, NextResponse.json({ error: 'Token inválido.', code: 'WIDGET_TOKEN_INVALID' }, { status: 401 }));
  }
  if (!isWidgetActive(w)) {
    return withCors(
      req,
      NextResponse.json({ error: 'Widget desactivado.', code: 'WIDGET_DISABLED' }, { status: 403 }),
    );
  }
  if (!isOriginAllowed(req.headers.get('origin'), w.allowedOrigins)) {
    return withCors(
      req,
      NextResponse.json({ error: 'Origen no permitido.', code: 'ORIGIN_NOT_ALLOWED' }, { status: 403 }),
    );
  }
  if (agentId) {
    const match = await sentAgentIdMatchesWidget(agentId, w.agentId);
    if (!match) {
      return withCors(
        req,
        NextResponse.json({ error: 'agentId no coincide con el widget.', code: 'WIDGET_AGENT_MISMATCH' }, { status: 403 }),
      );
    }
  }

  try {
    const uploaded = await uploadWidgetImage(dataUrl, {
      userId: w.userId,
      sessionId: sessionId || undefined,
    });
    return withCors(
      req,
      NextResponse.json({
        ok: true,
        url: uploaded.url,
        publicId: uploaded.publicId,
        width: uploaded.width,
        height: uploaded.height,
        mimeType: uploaded.mimeType || 'image/jpeg',
      }),
    );
  } catch (err) {
    console.error('[widget/upload-image]', err);
    return withCors(
      req,
      NextResponse.json(
        { error: 'No se pudo subir la imagen.', code: 'UPLOAD_FAILED' },
        { status: 502 },
      ),
    );
  }
}

export const maxDuration = 30;
