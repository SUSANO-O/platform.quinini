import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsVoiceProvider, MAX_TTS_TEXT_LENGTH } from '@/lib/voice/providers/elevenlabs-provider';
import { VoiceProviderNotConfiguredError } from '@/lib/voice/types';

const ORIGINAL_ENV = { ...process.env };

describe('ElevenLabsVoiceProvider', () => {
  let provider: ElevenLabsVoiceProvider;

  beforeEach(() => {
    provider = new ElevenLabsVoiceProvider();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('implementa el nombre "elevenlabs"', () => {
    expect(provider.name).toBe('elevenlabs');
  });

  describe('isConfigured', () => {
    it('false sin API key', () => {
      delete process.env.ELEVENLABS_API_KEY;
      expect(provider.isConfigured()).toBe(false);
    });

    it('true con API key', () => {
      process.env.ELEVENLABS_API_KEY = 'sk_test_123';
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('synthesizeSpeech', () => {
    beforeEach(() => {
      process.env.ELEVENLABS_API_KEY = 'sk_test_123';
      process.env.ELEVENLABS_VOICE_ID = 'voice_default';
    });

    it('sin API key, lanza VoiceProviderNotConfiguredError sin llamar a fetch', async () => {
      delete process.env.ELEVENLABS_API_KEY;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(provider.synthesizeSpeech('hola')).rejects.toThrow(VoiceProviderNotConfiguredError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sin voice_id (ni override ni env), lanza VoiceProviderNotConfiguredError', async () => {
      delete process.env.ELEVENLABS_VOICE_ID;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(provider.synthesizeSpeech('hola')).rejects.toThrow(VoiceProviderNotConfiguredError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('texto vacío, lanza sin llamar a fetch', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(provider.synthesizeSpeech('   ')).rejects.toThrow(/vacío/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('recorta el texto al máximo permitido antes de mandarlo', async () => {
      const longText = 'a'.repeat(MAX_TTS_TEXT_LENGTH + 500);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });
      vi.stubGlobal('fetch', fetchMock);
      await provider.synthesizeSpeech(longText);
      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.text.length).toBe(MAX_TTS_TEXT_LENGTH);
    });

    it('usa el voice_id pasado por override, no el del env', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer });
      vi.stubGlobal('fetch', fetchMock);
      await provider.synthesizeSpeech('hola', 'voice_override');
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('voice_override');
      expect(url).not.toContain('voice_default');
    });

    it('devuelve audio en base64 con mimeType audio/mpeg', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from('fake-mp3-bytes') });
      vi.stubGlobal('fetch', fetchMock);
      const out = await provider.synthesizeSpeech('hola mundo');
      expect(out.mimeType).toBe('audio/mpeg');
      expect(Buffer.from(out.audioBase64, 'base64').toString()).toBe('fake-mp3-bytes');
    });

    it('HTTP no-OK de ElevenLabs, lanza con el status incluido', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
      vi.stubGlobal('fetch', fetchMock);
      await expect(provider.synthesizeSpeech('hola')).rejects.toThrow(/401/);
    });
  });

  describe('transcribeAudio', () => {
    beforeEach(() => {
      process.env.ELEVENLABS_API_KEY = 'sk_test_123';
    });

    it('sin API key, lanza VoiceProviderNotConfiguredError sin llamar a fetch', async () => {
      delete process.env.ELEVENLABS_API_KEY;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(provider.transcribeAudio(Buffer.from('x'), 'a.webm')).rejects.toThrow(VoiceProviderNotConfiguredError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('buffer vacío (caso real: clip de ruido de 0 bytes), lanza sin llamar a fetch', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(provider.transcribeAudio(Buffer.alloc(0), 'a.webm')).rejects.toThrow(/vacío/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('buffer más grande que el máximo, lanza sin llamar a fetch', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(provider.transcribeAudio(Buffer.alloc(9 * 1024 * 1024), 'a.webm')).rejects.toThrow(/grande/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('devuelve el texto transcrito y el idioma detectado', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'hola quiero un gps', language_code: 'spa' }) });
      vi.stubGlobal('fetch', fetchMock);
      const out = await provider.transcribeAudio(Buffer.from('audio-bytes'), 'clip.webm');
      expect(out.text).toBe('hola quiero un gps');
      expect(out.languageCode).toBe('spa');
    });

    it('HTTP no-OK (caso real: key sin permiso speech_to_text), lanza con el status', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'missing_permissions' });
      vi.stubGlobal('fetch', fetchMock);
      await expect(provider.transcribeAudio(Buffer.from('audio-bytes'), 'clip.webm')).rejects.toThrow(/401/);
    });
  });
});
