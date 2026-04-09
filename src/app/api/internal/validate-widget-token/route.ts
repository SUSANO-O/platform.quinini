/**
 * POST /api/internal/validate-widget-token
 * Server-to-server desde AgentFlowhub: comprueba que un wt_* existe en Mongo
 * para el agentId del catálogo (mismo string que envía el SDK).
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { findWidgetForWtToken, sentAgentIdMatchesWidget } from '@/lib/widget-token-verify';

function getSecret(req: NextRequest): string | null {
  return (
    req.headers.get('x-hub-sync-secret')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    null
  );
}

export async function POST(req: NextRequest) {
  const expected = process.env.HUB_TO_LANDING_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: 'No configurado.' }, { status: 503 });
  }

  const got = getSecret(req);
  if (!got || got !== expected) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  let body: { agentId?: string; token?: string; widgetId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const agentId = String(body?.agentId || '').trim();
  const token = String(body?.token || '').trim();
  const widgetId =
    typeof body?.widgetId === 'string' ? body.widgetId.trim() : '';

  if (!agentId || !token.startsWith('wt_')) {
    return NextResponse.json({ valid: false });
  }

  try {
    await connectDB();
    const w = await findWidgetForWtToken(token, widgetId || undefined);
    if (!w) {
      return NextResponse.json({ valid: false });
    }
    const ok = await sentAgentIdMatchesWidget(agentId, w.agentId);
    return NextResponse.json({ valid: ok });
  } catch {
    return NextResponse.json({ valid: false }, { status: 200 });
  }
}
