/**
 * POST /api/internal/assist/botiva-api/execute
 * Proxy server-to-server AIBackHub → landing → API REST (clave afapi_ delegada).
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySignature, SIGNATURE_HEADER } from '@/lib/hub-signature';
import { proxyBotivaApiRequest } from '@/lib/botiva-api-delegation';

function isAuthorized(req: NextRequest, rawBody: string, expected: string): boolean {
  const sig = req.headers.get(SIGNATURE_HEADER);
  if (sig) return verifySignature(rawBody, sig, expected);
  const legacy =
    req.headers.get('x-hub-sync-secret')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    '';
  return legacy === expected;
}

export async function POST(req: NextRequest) {
  const expected = process.env.HUB_TO_LANDING_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: 'No configurado.' }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!isAuthorized(req, rawBody, expected)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  let body: {
    userId?: string;
    method?: string;
    path?: string;
    query?: Record<string, string>;
    body?: unknown;
  };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const userId = String(body.userId || '').trim();
  const method = String(body.method || 'GET').trim().toUpperCase();
  const path = String(body.path || '').trim();

  if (!userId || !/^[a-f0-9]{24}$/i.test(userId)) {
    return NextResponse.json({ error: 'userId inválido.' }, { status: 400 });
  }
  if (!path) {
    return NextResponse.json({ error: 'path requerido.' }, { status: 400 });
  }

  try {
    const result = await proxyBotivaApiRequest({
      userId,
      method,
      path,
      query: body.query,
      body: body.body,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : result.status || 502 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
