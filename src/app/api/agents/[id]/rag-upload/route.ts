/**
 * POST /api/agents/[id]/rag-upload
 * Accepts multipart/form-data with a single "file" field (archivos pequeños / sin Blob).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestRagFileToAgent } from '@/lib/rag-file-ingest';
import { getRagDirectUploadMaxBytes } from '@/lib/rag-upload-limits';
import { getRagUploadContext } from '@/lib/rag-upload-server';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const uploadLimit = getRagDirectUploadMaxBytes();
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > uploadLimit) {
    return NextResponse.json(
      {
        error: `El archivo supera el límite de ${uploadLimit / 1024 / 1024} MB para subida directa. Usa un PDF más pequeño o configura BLOB_READ_WRITE_TOKEN.`,
      },
      { status: 413 },
    );
  }

  const ctx = await getRagUploadContext(req, id);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Error al leer el archivo. Verifica que el formato es válido.' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const result = await ingestRagFileToAgent(
    ctx.agent,
    {
      buffer,
      filename: file.name || 'archivo',
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    },
    ctx.limits,
    { syncHub: req.nextUrl.searchParams.get('deferSync') !== '1' },
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    source: result.source,
    message: result.warning
      ? `Archivo procesado con aviso: ${result.warning}`
      : `Archivo procesado correctamente.`,
  });
}
