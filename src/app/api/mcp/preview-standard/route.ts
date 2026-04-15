/**
 * POST /api/mcp/preview-standard
 * Proxy a AIBackHub: descubre tools de un servidor MCP estándar sin guardar conexión (Fase B).
 * Body: { serverUrl?: string, authHeader?: string, presetId?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';
import { getSessionUserId } from '@/lib/mcp-landing-auth';

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const base = getAibackhubBaseUrl();
  if (!base) {
    return NextResponse.json({ error: 'BACKEND_URL no configurada.' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    serverUrl?: string;
    authHeader?: string;
    presetId?: string;
  };

  try {
    const res = await fetch(`${base}/api/mcp/preview-standard`, {
      method: 'POST',
      headers: hubCreateHeaders(),
      body: JSON.stringify({
        serverUrl: body.serverUrl ?? '',
        authHeader: body.authHeader,
        presetId: body.presetId,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
