/**
 * POST /api/widgets/voice-preview
 *
 * Genera un fragmento corto de audio con una voz de ElevenLabs, para que el
 * usuario la escuche antes de elegirla en el widget builder. Requiere sesión
 * (cookie afhub_session) — a diferencia de /api/widget/voice/tts (público,
 * token wt_*), esto vive del lado del dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { getVoiceProvider } from '@/lib/voice/provider';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';

const SAMPLE_TEXT = 'Hola, así sonará tu asistente respondiendo a tus clientes.';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const rl = await checkRateLimitAsync('widget-voice-preview', getClientIp(req) || userId, 15, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta en unos segundos.', code: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  const voiceProvider = getVoiceProvider();
  if (!voiceProvider.isConfigured()) {
    return NextResponse.json({ error: 'Voz no configurada en el servidor.', code: 'VOICE_NOT_CONFIGURED' }, { status: 503 });
  }

  const raw = (await req.json().catch(() => null)) as { voiceId?: string } | null;
  const voiceId = typeof raw?.voiceId === 'string' ? raw.voiceId.trim() : '';

  try {
    const { audioBase64, mimeType } = await voiceProvider.synthesizeSpeech(SAMPLE_TEXT, voiceId || undefined);
    return NextResponse.json({ ok: true, audioBase64, mimeType });
  } catch (err) {
    console.error('[widgets/voice-preview]', voiceProvider.name, err);
    return NextResponse.json({ error: 'No se pudo generar la muestra de voz.', code: 'PREVIEW_FAILED' }, { status: 502 });
  }
}
