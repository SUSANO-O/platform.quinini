/**
 * Contrato de un proveedor de voz para el widget (TTS de las respuestas del bot
 * + STT del dictado). Las rutas del widget (voice/tts, voice/stt) programan
 * contra esta interfaz, nunca contra un proveedor concreto — el día que se
 * cambie de proveedor (PlayHT, OpenAI, Deepgram...), solo hace falta escribir
 * una clase nueva en `providers/` que la implemente y activarla en
 * `getVoiceProvider()` (provider.ts). Ni las rutas ni el resto del widget
 * cambian una línea.
 */

export type SynthesizeSpeechResult = { audioBase64: string; mimeType: string };
export type TranscribeAudioResult = { text: string; languageCode?: string };

export interface VoiceProvider {
  /** Nombre corto — solo para logs/diagnóstico, no para lógica condicional. */
  readonly name: string;

  /** Límite de caracteres de texto que acepta synthesizeSpeech (varía por proveedor/plan). */
  readonly maxTtsTextLength: number;

  /** Límite de bytes de audio que acepta transcribeAudio. */
  readonly maxSttAudioBytes: number;

  /** true si el proveedor tiene todo lo necesario (API key, etc.) para operar. */
  isConfigured(): boolean;

  /** Convierte texto a voz. Lanza VoiceProviderNotConfiguredError si falta configuración. */
  synthesizeSpeech(text: string, voiceId?: string): Promise<SynthesizeSpeechResult>;

  /** Transcribe un clip de audio ya grabado (no streaming/interino). */
  transcribeAudio(audioBuffer: Buffer, fileName: string): Promise<TranscribeAudioResult>;
}

/**
 * Error de dominio — permite a las rutas distinguir "no configurado" (503,
 * el widget cae al fallback nativo del navegador) de un fallo real del
 * proveedor (502).
 */
export class VoiceProviderNotConfiguredError extends Error {
  constructor(providerName: string) {
    super(`Proveedor de voz "${providerName}" no configurado`);
    this.name = 'VoiceProviderNotConfiguredError';
  }
}
