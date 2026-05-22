/**
 * POST /api/quick-start/finalize
 * JSON { agentId } → sync hub + snippet embed
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { verifySessionToken, isUserEmailVerified, isImpersonationSession } from '@/lib/auth';
import { User, Widget } from '@/lib/db/models';
import { buildEmbedSnippet, runQuickStartFinalize } from '@/lib/quick-start-setup';

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

  const agentId = typeof (body as { agentId?: unknown })?.agentId === 'string'
    ? (body as { agentId: string }).agentId.trim()
    : '';
  if (!agentId) {
    return NextResponse.json({ error: 'Falta agentId.' }, { status: 400 });
  }

  const result = await runQuickStartFinalize(userId, agentId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const widget = await Widget.findOne({ agentId, userId })
    .select({ afhubToken: 1, name: 1 })
    .lean() as { _id?: { toString(): string }; afhubToken?: string; name?: string } | null;
  if (!widget?.afhubToken) {
    return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });
  }

  const origin =
    req.headers.get('x-forwarded-host')
      ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}`
      : req.nextUrl.origin;

  return NextResponse.json({
    ok: true,
    agentId: result.agentId,
    widgetId: widget._id?.toString() ?? '',
    afhubToken: widget.afhubToken,
    widgetName: widget.name ?? '',
    filesIngested: result.filesIngested,
    snippet: buildEmbedSnippet(origin, widget.afhubToken),
    origin,
  });
}
