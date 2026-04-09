import { NextResponse } from 'next/server';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';

/**
 * Proxy a AIBackHub GET /api/models/available (catálogo en Mongo + filtro por API keys).
 * La landing y el Hub usan la misma fuente de verdad.
 */
export async function GET() {
  const base = getAibackhubBaseUrl();
  if (!base) {
    return NextResponse.json(
      { success: false, error: 'BACKEND_URL no configurado en el servidor.' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${base}/api/models/available`, {
      method: 'GET',
      headers: hubCreateHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json(json, { status: res.status });
    }
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al contactar AIBackHub';
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}
