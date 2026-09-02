/**
 * Composition root del proveedor de voz del widget — el ÚNICO lugar que sabe
 * qué proveedor concreto está activo. Para migrar (p. ej. de ElevenLabs a
 * PlayHT): escribir la clase nueva en `providers/`, agregar su `case` acá y
 * cambiar VOICE_PROVIDER en el env. Las rutas del widget (voice/tts, voice/stt)
 * y todo lo demás siguen programando contra `VoiceProvider` sin cambios.
 */

import type { VoiceProvider } from '@/lib/voice/types';
import { ElevenLabsVoiceProvider } from '@/lib/voice/providers/elevenlabs-provider';

let cached: VoiceProvider | null = null;

export function getVoiceProvider(): VoiceProvider {
  if (cached) return cached;
  const name = (process.env.VOICE_PROVIDER || 'elevenlabs').trim().toLowerCase();
  switch (name) {
    case 'elevenlabs':
    default:
      cached = new ElevenLabsVoiceProvider();
      return cached;
  }
}

/** Solo para tests — limpia el singleton cacheado entre casos. */
export function __resetVoiceProviderForTests(): void {
  cached = null;
}
