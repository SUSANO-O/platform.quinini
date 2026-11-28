import { describe, expect, it, vi } from 'vitest';
import {
  buildRealtimeSttUrl,
  languageCodeFrom,
  mintRealtimeSttToken,
  realtimeSttEnabled,
} from '@/lib/voice/realtime-stt';

describe('dictado en tiempo real (servidor)', () => {
  it('se activa solo con API key y se apaga con VOICE_REALTIME_STT=0', () => {
    expect(realtimeSttEnabled({ ELEVENLABS_API_KEY: 'k' })).toBe(true);
    expect(realtimeSttEnabled({ ELEVENLABS_API_KEY: 'k', VOICE_REALTIME_STT: '0' })).toBe(false);
    expect(realtimeSttEnabled({})).toBe(false);
  });

  it('idioma ISO desde el locale del navegador', () => {
    expect(languageCodeFrom('es-CO')).toBe('es');
    expect(languageCodeFrom('en_US')).toBe('en');
    expect(languageCodeFrom('pt')).toBe('pt');
    expect(languageCodeFrom('')).toBe('');
    expect(languageCodeFrom('??')).toBe('');
  });

  it('URL con modelo, PCM 16 kHz, corte por silencio ~1 s e idioma; la key nunca va', () => {
    const u = new URL(buildRealtimeSttUrl({ token: 'sutkn_x', language: 'es-CO' }));
    expect(u.origin + u.pathname).toBe('wss://api.elevenlabs.io/v1/speech-to-text/realtime');
    expect(u.searchParams.get('model_id')).toBe('scribe_v2_realtime');
    expect(u.searchParams.get('token')).toBe('sutkn_x');
    expect(u.searchParams.get('audio_format')).toBe('pcm_16000');
    expect(u.searchParams.get('commit_strategy')).toBe('vad');
    expect(u.searchParams.get('vad_silence_threshold_secs')).toBe('1');
    expect(u.searchParams.get('language_code')).toBe('es');
    expect(u.toString()).not.toMatch(/xi-api-key|api_key/);
  });

  it('pide el token de un solo uso con la key en cabecera y lo devuelve', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ token: 'sutkn_1' }), { status: 200 }));
    await expect(mintRealtimeSttToken('KEY', f as unknown as typeof fetch)).resolves.toBe('sutkn_1');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/v1/single-use-token/realtime_scribe');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('KEY');
    expect(url).not.toContain('KEY');
  });

  it('falla claro si ElevenLabs rechaza o no manda token', async () => {
    const bad = vi.fn(async () => new Response('nope', { status: 401 }));
    await expect(mintRealtimeSttToken('K', bad as unknown as typeof fetch)).rejects.toThrow(/401/);
    const empty = vi.fn(async () => new Response('{}', { status: 200 }));
    await expect(mintRealtimeSttToken('K', empty as unknown as typeof fetch)).rejects.toThrow(/sin token/);
  });
});
