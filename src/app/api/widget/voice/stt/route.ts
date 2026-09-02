/**
 * POST /api/widget/voice/stt
 *
 * Transcribe un clip de audio grabado en el widget (dictado) vía ElevenLabs Scribe.
 * Body: { dataUrl (data:audio/...;base64,...), sessionId?, widgetId?, agentId?, token? }
 * Header: X-Widget-Token (wt_*)
 *
 * A diferencia del SpeechRecognition nativo, esto NO da texto interino palabra
 * por palabra — transcribe el clip completo una vez que el cliente termina de
 * grabar (silencio detectado o el usuario suelta el botón).
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

function mimeTypeFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:(audio\/[a-z0-9.+-]+);base64,/i);
  return m ? m[1]! : '';
}

function extFromMimeType(mimeType: string): string {
  const m = mimeType.match(/^audio\/([a-z0-9.+-]+)$/i);
  if (!m) return 'webm';
  return m[1]!.split(';')[0]!.replace('x-', '');
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimitAsync('widget-voice-stt', ip, 20, 60_000);
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

  let body: { dataUrl?: string; sessionId?: string; widgetId?: string; agentId?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return withCors(req, NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }));
  }

  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl.trim() : '';
  const mimeType = mimeTypeFromDataUrl(dataUrl);
  if (!mimeType) {
    return withCors(
      req,
      NextResponse.json({ error: 'Se requiere dataUrl de audio válida.', code: 'INVALID_AUDIO' }, { status: 400 }),
    );
  }
  if (dataUrl.length > voiceProvider.maxSttAudioBytes * 1.4) {
    // base64 pesa ~33% más que los bytes originales; margen para no rechazar de más.
    return withCors(
      req,
      NextResponse.json({ error: 'Audio demasiado grande.', code: 'AUDIO_TOO_LARGE' }, { status: 413 }),
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
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const buffer = Buffer.from(base64, 'base64');
    const { text } = await voiceProvider.transcribeAudio(buffer, `dictado.${extFromMimeType(mimeType)}`);
    return withCors(req, NextResponse.json({ ok: true, text }));
  } catch (err) {
    console.error('[widget/voice/stt]', voiceProvider.name, err);
    return withCors(req, NextResponse.json({ error: 'No se pudo transcribir el audio.', code: 'STT_FAILED' }, { status: 502 }));
  }
}

export const maxDuration = 30;
