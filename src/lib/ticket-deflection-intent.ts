/**
 * Encuesta previa a abrir un ticket ("¿ya intentaste esto?") — deflection.
 *
 * Contexto: pedirle al usuario que abra un ticket apenas dice "quiero
 * reportar un problema" (sin saber cuál) llena de tickets por cosas que ya
 * están resueltas en el RAG/FAQ (ej. "no puedo ingresar a mi app" → la
 * solución ya documentada es "restablecer la contraseña"). Este módulo
 * agrega dos pasos de código —determinísticos, sin depender del LLM para
 * el control de flujo, misma filosofía que ticket-form-intent.ts— entre
 * "el usuario quiere un ticket" y "mostrar el formulario":
 *
 * 1. Si el pedido es vago ("quiero levantar un ticket", sin detalle), se le
 *    pregunta el problema en vez de abrir el formulario de una.
 * 2. Una vez que hay un problema concreto, si el RAG tiene una fuente con
 *    buena confianza, se le muestra al usuario esa solución y se le
 *    pregunta si le sirvió (Sí/No) ANTES de ofrecer el ticket — ver
 *    matias-backend/src/ai/services/ticket-deflection.ts para el chequeo.
 *
 * La redacción de la pregunta y la respuesta de deflection son fijas
 * (plantillas), no generadas por LLM: mostrar tal cual el texto de la
 * fuente encontrada es más confiable y más honesto que pedirle al modelo
 * que la parafrasee en una pregunta de sí/no — evita tanto el riesgo de
 * que invente matices que la fuente no dice, como el problema de
 * confiabilidad de instrucciones multi-paso ya documentado en
 * ticket-form-intent.ts.
 */

/** Palabras de relleno que no aportan info real del problema — se ignoran al medir "cuánto detalle hay". */
const FILLER_WORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'con', 'por', 'para', 'que', 'y', 'o', 'mi', 'me', 'se', 'es', 'esta', 'está',
  'tengo', 'porque', 'ya', 'quiero', 'necesito', 'quisiera', 'favor', 'por favor',
  'hola', 'buenas', 'buenos', 'dias', 'días', 'tardes', 'noches',
  // Nombrar la CATEGORÍA del problema (sin decir qué le pasa) no es detalle real
  // — bug real: "tengo un problema con mi dispositivo o la app" pasaba como
  // "concreto" (contaba "dispositivo"/"app" como sustancia) y disparaba una
  // búsqueda RAG contra un mensaje que en la práctica sigue sin decir nada.
  'dispositivo', 'app', 'aplicacion', 'aplicación', 'producto', 'servicio',
  'plataforma', 'sistema', 'cuenta', 'plan',
]);

/**
 * Recorta del mensaje la frase de intención de ticket ya detectada por
 * `looksLikeTicketRequest` (import circular evitado: recibe los patterns
 * como parámetro desde ticket-form-intent.ts) y devuelve lo que sobra.
 */
export function extractRemainderAfterMatch(message: string, patterns: RegExp[]): string {
  const text = (message || '').trim();
  for (const re of patterns) {
    const m = text.match(re);
    if (m && typeof m.index === 'number') {
      const before = text.slice(0, m.index);
      const after = text.slice(m.index + m[0].length);
      return `${before} ${after}`.replace(/\s+/g, ' ').trim();
    }
  }
  return text;
}

/**
 * ¿El remanente (mensaje sin la frase de intención de ticket) tiene
 * suficiente sustancia como para intentar buscar en el RAG, o es tan vago
 * ("quiero levantar un ticket", nada más) que hay que preguntar primero?
 * Conservador: ante la duda, prefiere preguntar (mejor UX) a lanzar una
 * búsqueda de RAG contra un texto sin contenido real.
 */
export function isVagueRemainder(remainder: string): boolean {
  const cleaned = remainder
    .toLowerCase()
    .replace(/[.,;:!¡¿?()"'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return true;
  const meaningfulWords = cleaned.split(' ').filter((w) => w && !FILLER_WORDS.has(w));
  return meaningfulWords.length === 0 || cleaned.length < 8;
}

/** Interpreta una respuesta como Sí/No de forma determinística (sin LLM). Null si es ambigua. */
export function interpretYesNo(text: string): 'yes' | 'no' | null {
  const n = (text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (!n) return null;
  // Nota: `n` ya pasó por NFD + remoción de diacríticos, así que "sí"/"aún"
  // llegan como "si"/"aun" — no hace falta listar ambas variantes.
  if (/^(si|yes|ya|claro|resuelto|listo|funciono)\b/.test(n)) return 'yes';
  if (/^(no|nop|nope|sigo|todavia|persiste)\b/.test(n)) return 'no';
  return null;
}

/** Pregunta amable para cuando el usuario pide un ticket sin decir cuál es el problema. */
export function buildAskProblemReply(): string {
  return '¡Con gusto te ayudo! Contame con un poco más de detalle qué problema estás teniendo y vemos cómo resolverlo 🙂';
}

/** Marcador que el widget interpreta como "mostrar encuesta Sí/No de deflection". */
export const SURVEY_YESNO_MARKER = '[[SURVEY_YESNO]]';

/** Mensaje con la posible solución + la pregunta de la encuesta, listo para mandar al widget. */
export function buildDeflectionSurveyReply(sourceText: string): string {
  const trimmed = sourceText.trim();
  return (
    `Antes de abrir el ticket, fijate si esto te ayuda:\n\n` +
    `«${trimmed}»\n\n` +
    `¿Esto resolvió tu problema? ${SURVEY_YESNO_MARKER}`
  );
}

/** Respuesta cálida de cierre cuando la encuesta de deflection dice que sí se resolvió. */
export function buildDeflectionResolvedReply(): string {
  return '¡Genial, me alegra haberte ayudado! 🙌 Si necesitás algo más, quedo atento.';
}
