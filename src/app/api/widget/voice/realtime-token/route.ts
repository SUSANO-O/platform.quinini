/**
 * POST /api/widget/voice/realtime-token
 *
 * Entrega al widget un token de UN SOLO USO para el dictado en tiempo real (ElevenLabs Scribe
 * Realtime) y la URL WebSocket a la que conectarse. La API key nunca sale del servidor.
 * Mismas comprobaciones que /api/widget/voice/stt: token wt_, widget activo, origen permitido.
 * Body: { widgetId?, agentId?, token?, lang? } · Header: X-Widget-Token (wt_*)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { findWidgetForWtToken, isWidgetActive, sentAgentIdMatchesWidget } from '@/lib/widget-token-verify';
import { isOriginAllowed } from '@/lib/widget-origin-check';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';
import {
  REALTIME_STT_SAMPLE_RATE,
  buildRealtimeSttUrl,
  mintRealtimeSttToken,
  realtimeSttEnabled,
} from '@/lib/voice/realtime-stt';

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

const fail = (req: NextRequest, status: number, error: string, code: string) =>
  withCors(req, NextResponse.json({ error, code }, { status }));

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimitAsync('widget-voice-rt-token', ip, 15, 60_000);
  if (!rl.success) return fail(req, 429, 'Demasiadas solicitudes de voz. Intenta en unos segundos.', 'RATE_LIMITED');

  if (!realtimeSttEnabled()) return fail(req, 503, 'Dictado en tiempo real no disponible.', 'REALTIME_STT_DISABLED');

  let body: { widgetId?: string; agentId?: string; token?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, 'JSON inválido.', 'BAD_JSON');
  }

  const widgetToken = (
    (req.headers.get('x-widget-token') || '').trim() ||
    (typeof body.token === 'string' ? body.token.trim() : '')
  ).trim();
  if (!widgetToken.startsWith('wt_')) return fail(req, 401, 'Token de widget requerido.', 'WIDGET_TOKEN_REQUIRED');

  const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
  const widgetId = typeof body.widgetId === 'string' ? body.widgetId.trim() : '';

  await connectDB();
  const w = await findWidgetForWtToken(widgetToken, widgetId || undefined);
  if (!w) return fail(req, 401, 'Token inválido.', 'WIDGET_TOKEN_INVALID');
  if (!isWidgetActive(w)) return fail(req, 403, 'Widget desactivado.', 'WIDGET_DISABLED');
  if (!isOriginAllowed(req.headers.get('origin'), w.allowedOrigins)) {
    return fail(req, 403, 'Origen no permitido.', 'ORIGIN_NOT_ALLOWED');
  }
  if (agentId && !(await sentAgentIdMatchesWidget(agentId, w.agentId))) {
    return fail(req, 403, 'agentId no coincide con el widget.', 'WIDGET_AGENT_MISMATCH');
  }

  try {
    const token = await mintRealtimeSttToken(process.env.ELEVENLABS_API_KEY!.trim());
    const lang = typeof body.lang === 'string' ? body.lang.slice(0, 16) : '';
    return withCors(
      req,
      NextResponse.json({ ok: true, url: buildRealtimeSttUrl({ token, language: lang }), sampleRate: REALTIME_STT_SAMPLE_RATE }),
    );
  } catch (err) {
    console.error('[widget/voice/realtime-token]', err instanceof Error ? err.message : err);
    return fail(req, 502, 'No se pudo iniciar el dictado.', 'REALTIME_TOKEN_FAILED');
  }
}

export const maxDuration = 15;
