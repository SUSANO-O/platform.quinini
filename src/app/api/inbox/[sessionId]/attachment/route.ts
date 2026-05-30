/**
 * POST /api/inbox/[sessionId]/attachment
 * El agente sube un adjunto (imagen, video o documento) desde el inbox.
 * Multipart form-data, campo `file`. Sube a Cloudinary y devuelve la metadata;
 * el mensaje se crea luego en /reply con el array `attachments`.
 *
 * Auth: sesión del dueño del widget (cookie afhub_session).
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, Widget } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import {
  cloudinaryConfigured,
  uploadAgentAttachment,
  type CloudinaryResourceType,
} from '@/lib/cloudinary';

type Params = { params: Promise<{ sessionId: string }> };

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// Límites por tipo (bytes).
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

export async function POST(req: NextRequest, { params }: Params) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  if (!cloudinaryConfigured()) {
    return NextResponse.json(
      { error: 'Subida de archivos no configurada en el servidor.', code: 'CLOUDINARY_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const { sessionId } = await params;

  await connectDB();

  // Verificar que la sesión escalada pertenece a un widget del usuario.
  const session = await ConversationSession.findOne({ sessionId, escalated: true }).lean() as {
    widgetId?: string;
    chatSessionId?: string;
  } | null;
  if (!session) return NextResponse.json({ error: 'Sesión no encontrada o no escalada.' }, { status: 404 });

  const widgetId = String(session.widgetId || '');
  if (!widgetId) return NextResponse.json({ error: 'Sesión sin widget asociado.' }, { status: 400 });

  const widget = await Widget.findById(widgetId).select({ userId: 1 }).lean() as { userId?: unknown } | null;
  if (!widget || String(widget.userId) !== String(userId)) {
    return NextResponse.json({ error: 'No autorizado para esta sesión.' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Se esperaba multipart/form-data.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo (campo "file").' }, { status: 400 });
  }

  const mime = file.type || 'application/octet-stream';
  const { resourceType, type } = classify(mime);

  if (file.size > LIMITS[resourceType]) {
    const mb = Math.round(LIMITS[resourceType] / (1024 * 1024));
    return NextResponse.json(
      { error: `Archivo demasiado grande (máx. ${mb} MB para ${type}).`, code: 'FILE_TOO_LARGE' },
      { status: 413 },
    );
  }

  const filename = (file.name || 'archivo').slice(0, 120);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadAgentAttachment(buffer, {
      resourceType,
      userId: String(userId),
      sessionId: session.chatSessionId || sessionId,
      filename,
    });
    return NextResponse.json({
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
    });
  } catch (err) {
    console.error('[inbox/attachment]', err);
    return NextResponse.json(
      { error: 'No se pudo subir el archivo.', code: 'UPLOAD_FAILED' },
      { status: 502 },
    );
  }
}

export const maxDuration = 60;
