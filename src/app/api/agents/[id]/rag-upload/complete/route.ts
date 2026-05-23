/**
 * POST /api/agents/[id]/rag-upload/complete
 * Ingesta un archivo ya subido a Vercel Blob.
 */

import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { ingestRagFileToAgent } from '@/lib/rag-file-ingest';
import { getRagMaxFileSizeBytes, isRagBlobUploadEnabled } from '@/lib/rag-upload-limits';
import { getRagUploadContext } from '@/lib/rag-upload-server';

type Params = { params: Promise<{ id: string }> };

type CompleteBody = {
  downloadUrl?: string;
  pathname?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
};

export async function POST(req: NextRequest, { params }: Params) {
  if (!isRagBlobUploadEnabled()) {
    return NextResponse.json({ error: 'Subida blob no configurada.' }, { status: 503 });
  }

  const { id } = await params;
  const ctx = await getRagUploadContext(req, id);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  let body: CompleteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const downloadUrl = typeof body.downloadUrl === 'string' ? body.downloadUrl.trim() : '';
  const pathname = typeof body.pathname === 'string' ? body.pathname.trim() : '';
  const filename = typeof body.filename === 'string' ? body.filename.trim() : 'archivo';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : 'application/octet-stream';
  const size = Number(body.size);

  if (!downloadUrl || !pathname) {
    return NextResponse.json({ error: 'Faltan datos del archivo subido.' }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'Tamaño de archivo inválido.' }, { status: 400 });
  }
  if (size > getRagMaxFileSizeBytes()) {
    return NextResponse.json(
      { error: `El archivo excede el límite de ${getRagMaxFileSizeBytes() / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  let buffer: Buffer;
  try {
    const blobRes = await fetch(downloadUrl);
    if (!blobRes.ok) {
      return NextResponse.json({ error: 'No se pudo leer el archivo subido.' }, { status: 502 });
    }
    buffer = Buffer.from(await blobRes.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'Error al descargar el archivo temporal.' }, { status: 502 });
  }

  const deferSync = req.nextUrl.searchParams.get('deferSync') === '1';
  const result = await ingestRagFileToAgent(
    ctx.agent,
    { buffer, filename, mimeType, size },
    ctx.limits,
    { syncHub: !deferSync },
  );

  try {
    await del(pathname);
  } catch {
    /* best-effort cleanup */
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    source: result.source,
    message: result.warning
      ? `Archivo procesado con aviso: ${result.warning}`
      : 'Archivo procesado correctamente.',
  });
}
