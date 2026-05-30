/**
 * POST /api/widget/upload-attachment
 *
 * El VISITANTE sube un adjunto (imagen, video o documento) desde el widget para
 * enviárselo al agente humano (inbox). Multipart form-data, campo `file`.
 * Sube a Cloudinary y devuelve la metadata; el mensaje se crea luego en
 * /api/widget/user-message con el array `attachments`.
 *
 * Auth: X-Widget-Token (wt_*) + chequeo de origen (igual que /upload-image).
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import {
  cloudinaryConfigured,
  uploadAgentAttachment,
  type CloudinaryResourceType,
} from '@/lib/cloudinary';
import { findWidgetForWtToken, isWidgetActive } from '@/lib/widget-token-verify';
import { isOriginAllowed } from '@/lib/widget-origin-check';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';

const LIMITS: Record<CloudinaryResourceType, number> = {
  image: 10 * 1024 * 1024, // 10 MB
  video: 100 * 1024 * 1024, // 100 MB
  raw: 25 * 1024 * 1024, // 25 MB
};

function classify(mime: string): { resourceType: CloudinaryResourceType; type: 'image' | 'video' | 'file' } {
  if (mime.startsWith('image/')) return { resourceType: 'image', type: 'image' };
  if (mime.startsWith('video/')) return { resourceType: 'video', type: 'video' };
  return { resourceType: 'raw', type: 'file' };
}

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimitAsync('widget-upload-attachment', ip, 30, 60_000);
  if (!rl.success) {
    return withCors(
      req,
      NextResponse.json({ error: 'Demasiadas subidas. Intenta en unos segundos.', code: 'RATE_LIMITED' }, { status: 429 }),
    );
  }

  if (!cloudinaryConfigured()) {
    return withCors(
      req,
      NextResponse.json({ error: 'Subida de archivos no configurada en el servidor.', code: 'CLOUDINARY_NOT_CONFIGURED' }, { status: 503 }),
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return withCors(req, NextResponse.json({ error: 'Se esperaba multipart/form-data.' }, { status: 400 }));
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return withCors(req, NextResponse.json({ error: 'Falta el archivo (campo "file").' }, { status: 400 }));
  }

  const widgetToken = (
    (req.headers.get('x-widget-token') || '').trim() ||
    (typeof form.get('token') === 'string' ? String(form.get('token')).trim() : '')
  ).trim();
  if (!widgetToken.startsWith('wt_')) {
    return withCors(req, NextResponse.json({ error: 'Token de widget requerido.', code: 'WIDGET_TOKEN_REQUIRED' }, { status: 401 }));
  }

  const widgetId = typeof form.get('widgetId') === 'string' ? String(form.get('widgetId')).trim() : '';
  const sessionId = typeof form.get('sessionId') === 'string' ? String(form.get('sessionId')).trim() : '';

  await connectDB();
  const w = await findWidgetForWtToken(widgetToken, widgetId || undefined);
  if (!w) {
    return withCors(req, NextResponse.json({ error: 'Token inválido.', code: 'WIDGET_TOKEN_INVALID' }, { status: 401 }));
  }
  if (!isWidgetActive(w)) {
    return withCors(req, NextResponse.json({ error: 'Widget desactivado.', code: 'WIDGET_DISABLED' }, { status: 403 }));
  }
  if (!isOriginAllowed(req.headers.get('origin'), w.allowedOrigins)) {
    return withCors(req, NextResponse.json({ error: 'Origen no permitido.', code: 'ORIGIN_NOT_ALLOWED' }, { status: 403 }));
  }

  const mime = file.type || 'application/octet-stream';
  const { resourceType, type } = classify(mime);
  if (file.size > LIMITS[resourceType]) {
    const mb = Math.round(LIMITS[resourceType] / (1024 * 1024));
    return withCors(
      req,
      NextResponse.json({ error: `Archivo demasiado grande (máx. ${mb} MB para ${type}).`, code: 'FILE_TOO_LARGE' }, { status: 413 }),
    );
  }

  const filename = (file.name || 'archivo').slice(0, 120);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadAgentAttachment(buffer, {
      resourceType,
      userId: w.userId ? String(w.userId) : undefined,
      sessionId: sessionId || undefined,
      filename,
      kind: 'visitor',
    });
    return withCors(
      req,
      NextResponse.json({
        ok: true,
        attachment: {
          type,
          url: uploaded.url,
          publicId: uploaded.publicId,
          resourceType: uploaded.resourceType,
          name: filename,
          mime,
          bytes: uploaded.bytes ?? file.size,
          width: uploaded.width ?? 0,
          height: uploaded.height ?? 0,
        },
      }),
    );
  } catch (err) {
    console.error('[widget/upload-attachment]', err);
    return withCors(req, NextResponse.json({ error: 'No se pudo subir el archivo.', code: 'UPLOAD_FAILED' }, { status: 502 }));
  }
}

export const maxDuration = 60;
