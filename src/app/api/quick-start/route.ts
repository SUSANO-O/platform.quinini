/**
 * POST /api/quick-start
 * multipart/form-data — files[] (1–3 PDFs) → agente + widget + snippet
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { verifySessionToken, isUserEmailVerified, isImpersonationSession } from '@/lib/auth';
import { User } from '@/lib/db/models';
import { buildEmbedSnippet, runQuickStart, type QuickStartFile } from '@/lib/quick-start-setup';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();
  const user = await User.findById(userId).select({ emailVerified: 1 }).lean() as { emailVerified?: boolean } | null;
  if (!isImpersonationSession(req.cookies) && !isUserEmailVerified(user)) {
    return NextResponse.json(
      { error: 'Verifica tu correo antes de usar Quick Start.', code: 'EMAIL_NOT_VERIFIED' },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Error al leer los archivos.' }, { status: 400 });
  }

  const rawFiles = [
    ...formData.getAll('files'),
    ...formData.getAll('files[]'),
    ...(formData.get('file') ? [formData.get('file')] : []),
  ].filter((f): f is File => f instanceof File && f.size > 0);

  if (!rawFiles.length) {
    return NextResponse.json({ error: 'Sube al menos un PDF.' }, { status: 400 });
  }

  const files: QuickStartFile[] = [];
  for (const file of rawFiles.slice(0, 3)) {
    const arrayBuffer = await file.arrayBuffer();
    files.push({
      buffer: Buffer.from(arrayBuffer),
      filename: file.name || 'documento.pdf',
      mimeType: file.type || 'application/pdf',
      size: file.size,
    });
  }

  const result = await runQuickStart(userId, files);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const origin =
    req.headers.get('x-forwarded-host')
      ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}`
      : req.nextUrl.origin;

  return NextResponse.json({
    ok: true,
    agentId: result.agentId,
    widgetId: result.widgetId,
    afhubToken: result.afhubToken,
    agentName: result.agentName,
    widgetName: result.widgetName,
    filesIngested: result.filesIngested,
    ingestWarnings: result.ingestWarnings,
    snippet: buildEmbedSnippet(origin, result.afhubToken),
    origin,
  }, { status: 201 });
}
