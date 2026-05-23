/**
 * POST /api/agents/[id]/rag-upload/text
 * JSON { text, filename, originalSize? } — texto extraído en el cliente (sin subir PDF).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestRagTextToAgent } from '@/lib/rag-file-ingest';
import { getRagUploadContext } from '@/lib/rag-upload-server';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getRagUploadContext(req, id);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const text = typeof (body as { text?: unknown }).text === 'string' ? (body as { text: string }).text : '';
  const filename =
    typeof (body as { filename?: unknown }).filename === 'string'
      ? (body as { filename: string }).filename.trim()
      : 'documento.pdf';
  const originalSize = Number((body as { originalSize?: unknown }).originalSize);

  if (!text.trim()) {
    return NextResponse.json({ error: 'No se recibió texto.' }, { status: 400 });
  }

  const deferSync = req.nextUrl.searchParams.get('deferSync') === '1';
  const result = await ingestRagTextToAgent(
    ctx.agent,
    {
      text,
      filename: filename || 'documento.pdf',
      originalSize: Number.isFinite(originalSize) && originalSize > 0 ? originalSize : undefined,
    },
    ctx.limits,
    { syncHub: !deferSync },
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    source: result.source,
    message: result.warning
      ? `Archivo procesado con aviso: ${result.warning}`
      : 'Texto indexado correctamente.',
  });
}
