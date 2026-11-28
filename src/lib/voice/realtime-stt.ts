/**
 * Dictado en tiempo real (ElevenLabs Scribe v2 Realtime) para el widget.
 *
 * El navegador habla DIRECTO con ElevenLabs por WebSocket (menos latencia: el audio no pasa por
 * nuestro servidor), pero nunca ve la API key: el servidor emite un token de UN SOLO USO
 * (`/v1/single-use-token/realtime_scribe`, vence a los 15 min, se consume al conectar) y le dice
 * al widget con qué parámetros conectarse.
 */

export const REALTIME_STT_MODEL_ID = 'scribe_v2_realtime';
export const REALTIME_STT_WS_BASE = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
export const REALTIME_STT_SAMPLE_RATE = 16_000;
/**
 * El fin de turno lo decide el WIDGET (detector de voz local con piso de ruido adaptativo) y manda
 * `commit: true`: el detector de ElevenLabs con ruido de fondo no veía el silencio (turno colgado),
 * con voz baja no veía la voz y con pausas cortas cortaba la frase. Por eso commit_strategy=manual.
 */
/** Tope de una sesión de dictado (el widget pide otro token al volver a hablar). */
export const REALTIME_STT_MAX_SESSION_SECS = 600;

/** Interruptor sin desplegar código: VOICE_REALTIME_STT=0 vuelve al dictado del navegador. */
export function realtimeSttEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.VOICE_REALTIME_STT ?? '1').trim() !== '0' && Boolean(env.ELEVENLABS_API_KEY?.trim());
}

/** Código de idioma ISO 639-1 a partir de "es-CO", "en_US"… (vacío si no se reconoce). */
export function languageCodeFrom(lang: string | undefined | null): string {
  const m = String(lang || '').trim().toLowerCase().match(/^([a-z]{2,3})(?:[-_]|$)/);
  return m ? m[1]! : '';
}

export function buildRealtimeSttUrl(opts: { token: string; language?: string }): string {
  const q = new URLSearchParams({
    model_id: REALTIME_STT_MODEL_ID,
    token: opts.token,
    audio_format: `pcm_${REALTIME_STT_SAMPLE_RATE}`,
    commit_strategy: 'manual',
  });
  const lc = languageCodeFrom(opts.language);
  if (lc) q.set('language_code', lc);
  return `${REALTIME_STT_WS_BASE}?${q.toString()}`;
}

export async function mintRealtimeSttToken(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(
    `https://api.elevenlabs.io/v1/single-use-token/realtime_scribe?max_session_duration_seconds=${REALTIME_STT_MAX_SESSION_SECS}`,
    { method: 'POST', headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs token ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof json?.token === 'string' ? json.token : '';
  if (!token) throw new Error('ElevenLabs token: respuesta sin token');
  return token;
}
