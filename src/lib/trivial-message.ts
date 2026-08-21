/**
 * Clasificador heurístico de mensajes "triviales" (saludos / cortesías).
 *
 * Copia espejo de AIBackHub/src/lib/trivial-message.ts — mantener ambos en sync.
 *
 * Objetivo: detectar mensajes como "hola", "buenas", "gracias", "chao" para
 * enrutarlos a un modelo rápido y barato (gemini-2.5-flash-lite) SIN tools ni
 * RAG. Conservador: ante la duda devuelve `false`. Cero coste y cero latencia.
 */

export type SimpleTurn = { role: string; content: string };

/** Palabras de saludo / cortesía que NO requieren tools ni razonamiento. */
const TRIVIAL_WORDS = new Set([
  // saludos
  'hola', 'holi', 'holis', 'ola', 'hey', 'ey', 'buenas', 'buenos', 'dias', 'días',
  'tardes', 'noches', 'saludos', 'saludo', 'que', 'qué', 'tal', 'hello', 'hi',
  // cortesías / cierres
  'gracias', 'muchas', 'mil', 'graciass', 'thanks', 'genial', 'perfecto', 'excelente',
  'ok', 'oka', 'okay', 'okey', 'vale', 'dale', 'listo', 'bien', 'bueno', 'nada',
  'chao', 'chau', 'adios', 'adiós', 'bye', 'hasta', 'luego', 'pronto', 'cuidate', 'cuídate',
  // risas / muletillas
  'jaja', 'jajaja', 'jeje', 'jiji', 'jajajaja', 'lol', 'aja', 'ajá', 'si', 'sí', 'no',
]);

/** Confirmaciones ambiguas: triviales por sí solas, pero a mitad de un flujo
 *  pueden significar "sí, agéndalo / sí, envíalo" → NO se deben acelerar. */
const AMBIGUOUS_CONFIRMATIONS = new Set([
  'ok', 'oka', 'okay', 'okey', 'vale', 'dale', 'listo', 'si', 'sí', 'no', 'bueno',
]);

/** Tokens de intención que descartan trivialidad de inmediato. */
const INTENT_WORDS = new Set([
  'precio', 'precios', 'cuesta', 'cuanto', 'cuánto', 'cuanta', 'cuánta',
  'como', 'cómo', 'donde', 'dónde', 'cuando', 'cuándo', 'cual', 'cuál', 'por',
  'quiero', 'necesito', 'busco', 'puedo', 'pueden', 'podrian', 'podrían', 'ayuda',
  'ayudar', 'problema', 'comprar', 'compra', 'cotizar', 'cotizacion', 'cotización',
  'agenda', 'agendar', 'cita', 'reserva', 'reservar', 'factura', 'pago', 'pagar',
  'correo', 'email', 'telefono', 'teléfono', 'whatsapp', 'info', 'informacion',
  'información', 'producto', 'productos', 'servicio', 'servicios', 'plan', 'planes',
  'horario', 'direccion', 'dirección', 'envio', 'envío', 'pedido', 'orden',
]);

const PUNCT_RE = /[.,;:!¡¿?()"'`~\-_/\\]+/g;
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const LONG_DIGITS_RE = /\d{4,}/;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(PUNCT_RE, ' ').replace(/\s+/g, ' ').trim();
}

function lastModelTurnIsQuestion(history?: SimpleTurn[]): boolean {
  if (!history || history.length === 0) return false;
  const last = history[history.length - 1];
  if (!last) return false;
  const role = String(last.role || '');
  if (role !== 'model' && role !== 'assistant') return false;
  return /[?¿]/.test(last.content);
}

/**
 * Devuelve `true` solo si el mensaje es un saludo/cortesía trivial seguro de
 * acelerar al modelo barato sin tools.
 */
export function isTrivialMessage(message: string, history?: SimpleTurn[]): boolean {
  if (typeof message !== 'string') return false;

  const raw = message.trim();
  if (raw.length === 0) return false;
  if (raw.length > 40) return false;

  if (/[?¿]/.test(raw)) return false;
  if (EMAIL_RE.test(raw)) return false;
  if (LONG_DIGITS_RE.test(raw)) return false;

  const normalized = normalize(message);
  if (normalized.length === 0) return false;

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length === 0 || tokens.length > 5) return false;

  let sawTrivial = false;
  for (const token of tokens) {
    if (INTENT_WORDS.has(token)) return false;
    if (TRIVIAL_WORDS.has(token)) {
      sawTrivial = true;
      continue;
    }
    return false;
  }
  if (!sawTrivial) return false;

  const allAmbiguous = tokens.every((t) => AMBIGUOUS_CONFIRMATIONS.has(t));
  if (allAmbiguous && lastModelTurnIsQuestion(history)) return false;

  return true;
}
