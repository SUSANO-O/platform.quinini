import { NextRequest, NextResponse } from 'next/server';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';
import {
  getSessionUserId,
  getWritableLandingAgent,
  verifyConnectionBelongsToLandingAgent,
} from '@/lib/mcp-landing-auth';

type Params = { params: Promise<{ connectionId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const landingAgentId = req.nextUrl.searchParams.get('landingAgentId')?.trim();
  if (!landingAgentId) {
    return NextResponse.json({ error: 'Query landingAgentId es requerido.' }, { status: 400 });
  }

  const agent = await getWritableLandingAgent(landingAgentId, userId);
  if (!agent) {
    return NextResponse.json({ error: 'Agente no encontrado o no editable.' }, { status: 404 });
  }

  const { connectionId } = await params;
  const belongs = await verifyConnectionBelongsToLandingAgent(connectionId, landingAgentId);
  if (!belongs) {
    return NextResponse.json({ error: 'Conexión no encontrada para este agente.' }, { status: 404 });
  }

  const base = getAibackhubBaseUrl();
  if (!base) {
    return NextResponse.json({ error: 'BACKEND_URL no configurada.' }, { status: 503 });
  }

  const redirectUri = new URL('/api/mcp/hubspot-oauth/callback', req.nextUrl.origin).href;

  try {
    const res = await fetch(
      `${base}/api/mcp/connections/${encodeURIComponent(connectionId)}/hubspot-oauth/start`,
      {
        method: 'POST',
        headers: hubCreateHeaders(),
        body: JSON.stringify({
          redirectUri,
          landingClientAgentId: landingAgentId,
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
