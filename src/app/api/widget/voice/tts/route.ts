/**
 * POST /api/widget/voice/tts
 *
 * Convierte a voz (ElevenLabs) el texto de una respuesta del bot para el widget.
 * Body: { text, sessionId?, widgetId?, agentId?, token? }
 * Header: X-Widget-Token (wt_*)
 *
 * Devuelve audio en base64 (no streaming) — las respuestas del bot son cortas,
 * así que el overhead de base64 no importa y evita complejidad de streaming.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { getVoiceProvider } from '@/lib/voice/provider';
import { findWidgetForWtToken, isWidgetActive, sentAgentIdMatchesWidget } from '@/lib/widget-token-verify';
import { isOriginAllowed } from '@/lib/widget-origin-check';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimitAsync('widget-voice-tts', ip, 20, 60_000);
  if (!rl.success) {
    return withCors(
      req,
      NextResponse.json(
        { error: 'Demasiadas solicitudes de voz. Intenta en unos segundos.', code: 'RATE_LIMITED' },
        { status: 429 },
      ),
    );
  }

  const voiceProvider = getVoiceProvider();
  if (!voiceProvider.isConfigured()) {
    return withCors(
      req,
      NextResponse.json({ error: 'Voz no configurada en el servidor.', code: 'VOICE_NOT_CONFIGURED' }, { status: 503 }),
    );
  }

  let body: { text?: string; sessionId?: string; widgetId?: string; agentId?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return withCors(req, NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }));
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return withCors(req, NextResponse.json({ error: 'Se requiere texto.', code: 'TEXT_REQUIRED' }, { status: 400 }));
  }
  if (text.length > voiceProvider.maxTtsTextLength) {
    return withCors(
      req,
      NextResponse.json({ error: 'Texto demasiado largo.', code: 'TEXT_TOO_LONG' }, { status: 413 }),
    );
  }

  const widgetToken = (
    (req.headers.get('x-widget-token') || '').trim() ||
    (typeof body.token === 'string' ? body.token.trim() : '')
  ).trim();
  if (!widgetToken.startsWith('wt_')) {
    return withCors(
      req,
      NextResponse.json({ error: 'Token de widget requerido.', code: 'WIDGET_TOKEN_REQUIRED' }, { status: 401 }),
    );
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
  const widgetId = typeof body.widgetId === 'string' ? body.widgetId.trim() : '';

  await connectDB();
  const w = await findWidgetForWtToken(widgetToken, widgetId || undefined);
  if (!w) {
    return withCors(req, NextResponse.json({ error: 'Token inválido.', code: 'WIDGET_TOKEN_INVALID' }, { status: 401 }));
  }
  if (!isWidgetActive(w)) {
    return withCors(req, NextResponse.json({ error: 'Widget desactivado.', code: 'WIDGET_DISABLED' }, { status: 403 }));
  }
  if (!isOriginAllowed(req.headers.get('origin'), w.allowedOrigins)) {
    return withCors(req, NextResponse.json({ error: 'Origen no permitido.', code: 'ORIGIN_NOT_ALLOWED' }, { status: 403 }));
  }
  if (agentId) {
    const match = await sentAgentIdMatchesWidget(agentId, w.agentId);
    if (!match) {
      return withCors(
        req,
        NextResponse.json({ error: 'agentId no coincide con el widget.', code: 'WIDGET_AGENT_MISMATCH' }, { status: 403 }),
      );
    }
  }

  try {
    const { audioBase64, mimeType } = await voiceProvider.synthesizeSpeech(text);
    return withCors(req, NextResponse.json({ ok: true, audioBase64, mimeType }));
  } catch (err) {
    console.error('[widget/voice/tts]', voiceProvider.name, err);
    return withCors(req, NextResponse.json({ error: 'No se pudo generar la voz.', code: 'TTS_FAILED' }, { status: 502 }));
  }
}

export const maxDuration = 30;
