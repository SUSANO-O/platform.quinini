/**
 * GET /api/internal/assist/botiva-api/health
 * Comprobación para sync MCP (AIBackHub → landing → API REST).
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkBotivaApiHealth } from '@/lib/botiva-api-delegation';

function isAuthorized(req: NextRequest, expected: string): boolean {
  const legacy =
    req.headers.get('x-hub-sync-secret')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    '';
  return legacy === expected;
}

export async function GET(req: NextRequest) {
  const expected = process.env.HUB_TO_LANDING_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: 'No configurado.' }, { status: 503 });
  }
  if (!isAuthorized(req, expected)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const health = await checkBotivaApiHealth();
  return NextResponse.json({
    ok: health.ok,
    apiBaseUrl: health.apiBaseUrl,
    message: health.message,
  });
}
