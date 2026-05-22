/**
 * POST /api/quick-start/init
 * JSON { files: [{ name, size }] } → agente + widget (sin PDFs en el body)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { verifySessionToken, isUserEmailVerified, isImpersonationSession } from '@/lib/auth';
import { User } from '@/lib/db/models';
import { runQuickStartInit } from '@/lib/quick-start-setup';

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const rawFiles = (body as { files?: unknown })?.files;
  if (!Array.isArray(rawFiles)) {
    return NextResponse.json({ error: 'Indica al menos un PDF.' }, { status: 400 });
  }

  const files = rawFiles
    .map((f) => {
      if (!f || typeof f !== 'object') return null;
      const name = typeof (f as { name?: unknown }).name === 'string' ? (f as { name: string }).name : '';
      const size = Number((f as { size?: unknown }).size);
      if (!name || !Number.isFinite(size) || size <= 0) return null;
      return { name, size };
    })
    .filter((f): f is { name: string; size: number } => f !== null);

  const result = await runQuickStartInit(userId, files);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    agentId: result.agentId,
    widgetId: result.widgetId,
    afhubToken: result.afhubToken,
    agentName: result.agentName,
    widgetName: result.widgetName,
  }, { status: 201 });
}
