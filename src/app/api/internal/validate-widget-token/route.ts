/**
 * POST /api/internal/validate-widget-token
 * Server-to-server desde AgentFlowhub: comprueba que un wt_* existe en Mongo
 * para el agentId del catálogo (mismo string que envía el SDK).
 *
 * Auth: firma HMAC-SHA256 en X-Landing-Signature (generada por AgentFlowhub).
 * El secreto raw ya NO se acepta — usar la firma evita exposición en logs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { findWidgetForWtToken, sentAgentIdMatchesWidget } from '@/lib/widget-token-verify';
import { verifySignature, SIGNATURE_HEADER } from '@/lib/hub-signature';
import { logSecurityEvent } from '@/lib/security-log';

export async function POST(req: NextRequest) {
  const secret = process.env.HUB_TO_LANDING_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: 'No configurado.' }, { status: 503 });
  }

  // Leer body como texto para verificar la firma antes de parsear
  const rawBody = await req.text();

  const sigHeader = req.headers.get(SIGNATURE_HEADER);
  // Aceptar también el header legacy x-hub-sync-secret durante el periodo de migración
  const legacySecret = req.headers.get('x-hub-sync-secret')?.trim();

  const signatureValid = sigHeader
    ? verifySignature(rawBody, sigHeader, secret)
    : legacySecret === secret; // fallback legacy — se eliminará en próxima versión

  if (!signatureValid) {
    logSecurityEvent({
      event: 'signature_invalid',
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
      code: 'SIGNATURE_INVALID',
      meta: { hasNewSig: Boolean(sigHeader), hasLegacy: Boolean(legacySecret) },
    });
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  let body: { agentId?: string; token?: string; widgetId?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const agentId = String(body?.agentId || '').trim();
  const token   = String(body?.token   || '').trim();
  const widgetId = typeof body?.widgetId === 'string' ? body.widgetId.trim() : '';

  if (!agentId || !token.startsWith('wt_')) {
    return NextResponse.json({ valid: false });
  }

  try {
    await connectDB();
    const w = await findWidgetForWtToken(token, widgetId || undefined);
    if (!w) return NextResponse.json({ valid: false });
    const ok = await sentAgentIdMatchesWidget(agentId, w.agentId);
    return NextResponse.json({ valid: ok });
  } catch {
    return NextResponse.json({ valid: false }, { status: 200 });
  }
}
