/**
 * Adapter de ElevenLabs (plan Creator) al contrato VoiceProvider — ver
 * `../types.ts`. Toda la forma específica de la API de ElevenLabs (endpoints,
 * modelos, headers `xi-api-key`) vive encapsulada acá adentro; nada fuera de
 * este archivo sabe que el proveedor es ElevenLabs.
 */

import type { SynthesizeSpeechResult, TranscribeAudioResult, VoiceProvider } from '@/lib/voice/types';
import { VoiceProviderNotConfiguredError } from '@/lib/voice/types';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const TTS_MODEL_ID = 'eleven_multilingual_v2';
const STT_MODEL_ID = 'scribe_v1';

/** Límite generoso para una respuesta de chat leída en voz alta. */
export const MAX_TTS_TEXT_LENGTH = 2000;

/** Clips cortos de dictado — de sobra para varias frases habladas. */
export const MAX_STT_AUDIO_BYTES = 8 * 1024 * 1024;

export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly name = 'elevenlabs';
  readonly maxTtsTextLength = MAX_TTS_TEXT_LENGTH;
  readonly maxSttAudioBytes = MAX_STT_AUDIO_BYTES;

  private apiKey(): string {
    return process.env.ELEVENLABS_API_KEY?.trim() || '';
  }

  private defaultVoiceId(): string {
    return process.env.ELEVENLABS_VOICE_ID?.trim() || '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async synthesizeSpeech(text: string, voiceId?: string): Promise<SynthesizeSpeechResult> {
    const key = this.apiKey();
    if (!key) throw new VoiceProviderNotConfiguredError(this.name);
    const vId = (voiceId || this.defaultVoiceId()).trim();
    if (!vId) throw new VoiceProviderNotConfiguredError(this.name);
    const clipped = String(text || '').trim().slice(0, this.maxTtsTextLength);
    if (!clipped) throw new Error('Texto vacío');

    const res = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(vId)}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clipped, model_id: TTS_MODEL_ID }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`ElevenLabs TTS ${res.status}: ${detail.slice(0, 300)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { audioBase64: buf.toString('base64'), mimeType: 'audio/mpeg' };
  }

  async transcribeAudio(audioBuffer: Buffer, fileName: string): Promise<TranscribeAudioResult> {
    const key = this.apiKey();
    if (!key) throw new VoiceProviderNotConfiguredError(this.name);
    if (audioBuffer.length === 0) throw new Error('Audio vacío');
    if (audioBuffer.length > this.maxSttAudioBytes) throw new Error('Audio demasiado grande');

    const form = new FormData();
    form.append('model_id', STT_MODEL_ID);
    form.append('file', new Blob([new Uint8Array(audioBuffer)]), fileName || 'audio.webm');

    const res = await fetch(`${ELEVENLABS_API_BASE}/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': key },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`ElevenLabs STT ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as { text?: string; language_code?: string };
    return { text: String(data.text || '').trim(), languageCode: data.language_code };
  }
}
