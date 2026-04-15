/**
 * GET /api/mcp/catalog — catálogo MCP completo desde AIBackHub (campos de credenciales).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';
import { getSessionUserId } from '@/lib/mcp-landing-auth';

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const base = getAibackhubBaseUrl();
  if (!base) {
    return NextResponse.json({ error: 'BACKEND_URL no configurada.', catalog: [] }, { status: 503 });
  }

  try {
    const res = await fetch(`${base}/api/mcp/catalog`, {
      headers: hubCreateHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, catalog: [] }, { status: 502 });
  }
}
