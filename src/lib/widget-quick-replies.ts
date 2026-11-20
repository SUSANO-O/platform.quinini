/**
 * Quick-replies del widget: el agente puede terminar un mensaje con un marcador de opciones y el SDK
 * lo convierte en botones tocables. Formatos soportados (al final del mensaje, en su propia línea):
 *
 *   [opciones: Sí | No]
 *   [botones: Agendar | Ver precios | Hablar con alguien]
 *   [sí/no]            → equivale a [opciones: Sí | No]
 *
 * `parseQuickReplies` es puro y testeable. Devuelve el texto SIN el marcador + la lista de botones.
 */

export type QuickReply = { label: string };
export type ParsedQuickReplies = { text: string; buttons: QuickReply[] };

const MARKER_RE = /\n?\s*\[(?:opciones|botones|options|buttons)\s*:\s*([^\]\n]+)\]\s*$/i;
const YESNO_RE = /\n?\s*\[\s*s[ií]\s*\/\s*no\s*\]\s*$/i;

/** Extrae los botones del final del texto. Si no hay marcador, devuelve el texto tal cual y [] botones. */
export function parseQuickReplies(raw: string): ParsedQuickReplies {
  const input = typeof raw === 'string' ? raw : '';

  if (YESNO_RE.test(input)) {
    return { text: input.replace(YESNO_RE, '').trimEnd(), buttons: [{ label: 'Sí' }, { label: 'No' }] };
  }

  const m = input.match(MARKER_RE);
  if (!m) return { text: input, buttons: [] };

  const labels = m[1]
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 48)
    .slice(0, 6);

  if (labels.length === 0) return { text: input, buttons: [] };

  return {
    text: input.replace(MARKER_RE, '').trimEnd(),
    buttons: labels.map((label) => ({ label })),
  };
}

/** Indica si un texto trae un marcador de quick-replies (para decidir si procesarlo). */
export function hasQuickReplies(raw: string): boolean {
  return MARKER_RE.test(raw || '') || YESNO_RE.test(raw || '');
}
