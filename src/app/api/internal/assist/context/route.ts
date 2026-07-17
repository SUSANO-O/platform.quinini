import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import {
  assistContextToPublicJson,
  loadAssistSessionContext,
} from '@/lib/assist-session-context';

/**
 * GET /api/internal/assist/context?pagePath=/dashboard/agents
 * Snapshot del cliente logueado (Math-ais). Equivalente seguro a "curl" de contexto — solo sesión propia.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  const userId = token ? verifySessionToken(token) : null;
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const pagePath = req.nextUrl.searchParams.get('pagePath')?.trim() || '/dashboard';
  const ctx = await loadAssistSessionContext(userId, pagePath);
  if (!ctx) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    context: assistContextToPublicJson(ctx),
  });
}
