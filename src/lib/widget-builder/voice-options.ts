/**
 * Voces de ElevenLabs curadas para elegir por widget (voice_id → Widget.voiceId,
 * ver src/lib/voice/). Todas usan el mismo modelo (eleven_multilingual_v2), así
 * que el costo por carácter es el mismo sin importar cuál se elija — la curación
 * es solo por calidad/tono en español, no por precio entre ellas.
 */

export interface WidgetVoiceOption {
  /** '' = usa el default global del servidor (ELEVENLABS_VOICE_ID). */
  id: string;
  label: string;
  accent: string;
}

export const WIDGET_VOICE_OPTIONS: WidgetVoiceOption[] = [
  { id: '', label: 'Automática (default del servidor)', accent: '' },
  { id: 'uYlzyj2kIZo3HfBB21vF', label: 'Mateo — cálido y cercano', accent: 'Latam' },
  { id: '8sRcNpjdEUf8drN4gtem', label: 'Emiliano — cercano y natural', accent: 'Latam' },
  { id: 'xnVrS1ZkSQSq4Gm5AKKX', label: 'Luciana — suave y elegante', accent: 'Latam' },
  { id: '7EmI9SPdwF8NyYuIn2Vh', label: 'Sergio López — calmado', accent: 'Mexicana' },
  { id: 'E3gU1I86D0XjvRrEszPm', label: 'Daniel — ventas y atención', accent: 'Peninsular' },
];

export function widgetVoiceLabel(voiceId: string): string {
  const found = WIDGET_VOICE_OPTIONS.find((v) => v.id === voiceId);
  return found ? found.label : 'Automática (default del servidor)';
}
