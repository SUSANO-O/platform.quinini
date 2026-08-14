/**
 * FAQs del agente + bloque opcional de “candidatas” (preguntas repetidas sin FAQ formal).
 * Los marcadores se fusionan al system prompt igual que las reglas operativas.
 */

export const FAQ_PROMPT_START = '### [AFHUB_FAQ_START]';
export const FAQ_PROMPT_END = '### [AFHUB_FAQ_END]';

/** Umbral de repeticiones para recomendar (más de 3 veces → count >= 4). */
export const MIN_FAQ_CANDIDATE_REPETITIONS = 4;

export type AgentFaqRow = {
  id: string;
  question: string;
  answer: string;
  enabled: boolean;
  priority: number;
};

export type FaqCandidateRow = {
  id: string;
  /** Clave normalizada para deduplicar. */
  key: string;
  /** Mejor texto de pregunta detectado (muestra legible). */
  questionSample: string;
  /**
   * Lo que el agente contestó la última vez, como borrador para la FAQ. Es solo
   * una propuesta: sale de una conversación real y hay que revisarla antes de
   * fijarla, porque puede haber envejecido o venir de datos de aquel momento.
   */
  answerSample?: string;
  count: number;
  lastSeen: string;
  dismissed?: boolean;
};

const GREETING_PREFIX_RE =
  /^(hola|buenos días|buenas tardes|buenas noches|hey|hi|hello|saludos|buen día|buenas)[,!.\s]+/i;

const QUESTION_START_RE =
  /^(qué|que|q\b|cómo|como|cuánto|cuanto|cuál|cual|dónde|donde|cuándo|cuando|hay|tienen|tienes|puedo|puede|podría|podria|me gustaría|me gustaria|necesito|quisiera|información sobre|informacion sobre|info sobre|precio de|costo de|cuánto cuesta|cuanto cuesta|how|what|where|when|why|can i|do you|is there|are there|tell me|i need|i want to know)\b/i;

const NOISE_EXACT = new Set([
  'hola',
  'buenos dias',
  'buenas tardes',
  'buenas noches',
  'gracias',
  'muchas gracias',
  'ok',
  'okay',
  'vale',
  'perfecto',
  'genial',
  'entendido',
  'de acuerdo',
  'adios',
  'adiós',
  'bye',
  'chao',
  'saludos',
  'si',
  'sí',
  'no',
  'test',
  'prueba',
  'hello',
  'hi',
]);

/** Quita saludos iniciales y normaliza espacios. */
export function stripFaqNoise(raw: string): string {
  let t = String(raw || '').trim();
  if (!t) return '';
  for (let i = 0; i < 2; i++) {
    const next = t.replace(GREETING_PREFIX_RE, '').trim();
    if (next === t) break;
    t = next;
  }
  return t.replace(/\s+/g, ' ').trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|[\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

/** Extrae la frase más útil como pregunta FAQ desde un mensaje del usuario. */
export function extractFaqQuestionText(raw: string): string {
  const base = stripFaqNoise(raw);
  if (!base) return '';

  const sentences = splitSentences(base);
  if (sentences.length === 0) return base.slice(0, 400);

  const withQuestionMark = sentences.filter((s) => s.includes('?'));
  if (withQuestionMark.length) {
    return withQuestionMark.sort((a, b) => scoreFaqQuestion(b) - scoreFaqQuestion(a))[0].slice(0, 400);
  }

  const questionLike = sentences.filter((s) => looksLikeUserQuestion(s));
  if (questionLike.length) {
    return questionLike.sort((a, b) => scoreFaqQuestion(b) - scoreFaqQuestion(a))[0].slice(0, 400);
  }

  const substantive = sentences.filter((s) => s.length >= 12 && !isExactFaqNoise(s));
  if (substantive.length) {
    return substantive.sort((a, b) => scoreFaqQuestion(b) - scoreFaqQuestion(a))[0].slice(0, 400);
  }

  return base.slice(0, 400);
}

function scoreFaqQuestion(text: string): number {
  let score = Math.min(text.length, 200);
  if (text.includes('?')) score += 30;
  if (QUESTION_START_RE.test(text)) score += 20;
  if (/\b(precio|plan|devoluci|reembolso|horario|envío|envio|garantía|garantia)\b/i.test(text)) score += 15;
  return score;
}

export function isExactFaqNoise(text: string): boolean {
  const key = simpleFaqKey(text);
  if (key.length < 8) return true;
  if (NOISE_EXACT.has(key)) return true;
  if (/^(ok+|si+|no+|gracias+|hola+)$/.test(key.replace(/\s/g, ''))) return true;
  return false;
}

function simpleFaqKey(text: string): string {
  return stripFaqNoise(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:()[\]{}'"«»""]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function normalizeFaqKey(text: string): string {
  return simpleFaqKey(extractFaqQuestionText(text));
}

/** True si el mensaje parece una pregunta o solicitud de información útil para FAQ. */
export function looksLikeUserQuestion(text: string): boolean {
  const t = stripFaqNoise(text);
  if (t.length < 12) return false;
  if (isExactFaqNoise(t)) return false;
  if (t.includes('?')) return true;
  if (QUESTION_START_RE.test(t)) return true;
  if (/\b(precio|costo|plan|devoluci|reembolso|cómo funciona|como funciona|qué incluye|que incluye)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function isUsefulFaqCandidateMessage(raw: string): boolean {
  const extracted = extractFaqQuestionText(raw);
  if (extracted.length < 12) return false;
  if (isExactFaqNoise(extracted)) return false;
  if (!looksLikeUserQuestion(extracted)) return false;
  const alphaRatio = (extracted.match(/[a-záéíóúñ]/gi) ?? []).length / extracted.length;
  if (alphaRatio < 0.45) return false;
  return true;
}

/** Tope del borrador guardado: suficiente para una FAQ, no para un ensayo. */
export const MAX_FAQ_ANSWER_SAMPLE = 600;

const ANSWER_FAILURE_RE =
  /\b(no tengo acceso|no dispongo|no puedo (ayudar|darte|acceder|proporcionar)|no encuentro|no s[ée] (nada|responder)|lo siento|disculpa las molestias|intenta de nuevo|error al)/i;

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

/** Siete o más dígitos seguidos: teléfonos, DNIs, números de pedido. */
const IDENTIFIER_RE = /\d[\d\s().-]{5,}\d/;

/**
 * True si la respuesta sirve como punto de partida para una FAQ.
 *
 * Se descartan las disculpas y los "no tengo acceso" —que no fijan nada— y todo
 * lo que lleve un correo o algo que parezca un identificador, porque eso suele
 * ser de la persona que preguntaba y acabaría contándoselo al resto. Los precios
 * pasan el filtro: son cifras cortas y son justo lo que interesa fijar.
 */
export function isReusableFaqAnswer(raw: string): boolean {
  const t = String(raw ?? '').trim();
  if (t.length < 20) return false;
  if (ANSWER_FAILURE_RE.test(t)) return false;
  if (EMAIL_RE.test(t)) return false;
  if (IDENTIFIER_RE.test(t)) return false;
  const alphaRatio = (t.match(/[a-záéíóúñü]/gi) ?? []).length / t.length;
  return alphaRatio >= 0.45;
}

/** Borrador listo para guardar, o cadena vacía si la respuesta no sirve. */
export function buildFaqAnswerSample(raw: string): string {
  const t = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!isReusableFaqAnswer(t)) return '';
  return t.slice(0, MAX_FAQ_ANSWER_SAMPLE);
}

export function stripManagedFaqPrompt(raw: string): string {
  const s = raw || '';
  const start = s.indexOf(FAQ_PROMPT_START);
  const end = s.indexOf(FAQ_PROMPT_END);
  if (start === -1 || end === -1 || end < start) return s.trim();
  const before = s.slice(0, start).trimEnd();
  const after = s.slice(end + FAQ_PROMPT_END.length).trimStart();
  return [before, after].filter(Boolean).join('\n\n').trim();
}

function faqQuestionNorm(q: string): string {
  return normalizeFaqKey(q);
}

/** True si el mensaje del usuario coincide con alguna FAQ activa (misma clave normalizada). */
export function userMessageMatchesRegisteredFaq(
  userMessage: string,
  faqs: Array<{ question?: string; enabled?: boolean }>,
): boolean {
  const uk = normalizeFaqKey(userMessage);
  if (uk.length < 8) return true;
  const active = (faqs || []).filter((f) => f && f.enabled !== false);
  for (const f of active) {
    const fq = faqQuestionNorm(String(f.question ?? ''));
    if (fq.length < 8) continue;
    if (uk === fq) return true;
    if (uk.includes(fq) || fq.includes(uk)) return true;
  }
  return false;
}

/** Candidatas listas para mostrar al usuario o inyectar al prompt (repetidas > 3 veces). */
export function getPromotableFaqCandidates(
  candidates: FaqCandidateRow[],
  minCount = MIN_FAQ_CANDIDATE_REPETITIONS,
): FaqCandidateRow[] {
  return (candidates || [])
    .filter(
      (c) =>
        c &&
        !c.dismissed &&
        (c.count ?? 0) >= minCount &&
        String(c.questionSample || '').trim() &&
        isUsefulFaqCandidateMessage(c.questionSample),
    )
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
}

export function buildFaqPromptBlock(
  faqs: AgentFaqRow[],
  candidates: FaqCandidateRow[],
  minCandidateCount = MIN_FAQ_CANDIDATE_REPETITIONS,
): string {
  const activeFaqs = (faqs || [])
    .filter((f) => f && f.enabled !== false && String(f.question || '').trim() && String(f.answer || '').trim())
    .sort((a, b) => a.priority - b.priority);

  const topCandidates = getPromotableFaqCandidates(candidates, minCandidateCount).slice(0, 12);

  if (activeFaqs.length === 0 && topCandidates.length === 0) return '';

  const faqLines = activeFaqs.map(
    (f, i) =>
      `${i + 1}. **P:** ${String(f.question).trim()}\n   **R:** ${String(f.answer).trim()}`,
  );

  const candLines =
    topCandidates.length > 0
      ? [
          '',
          '### Preguntas que los usuarios repiten (aún sin respuesta fija en FAQ)',
          'No inventes datos contractuales. Responde con lo que sepas del contexto del agente y herramientas; si falta información, dilo y sugiere añadir una FAQ formal desde el panel.',
          ...topCandidates.map(
            (c, i) =>
              `${i + 1}. (≈${c.count}×) «${String(c.questionSample).trim().slice(0, 280)}${String(c.questionSample).length > 280 ? '…' : ''}»`,
          ),
        ]
      : [];

  return `${FAQ_PROMPT_START}
## Preguntas frecuentes (usa estas respuestas cuando la pregunta del usuario sea equivalente)
${faqLines.join('\n\n')}${candLines.join('\n')}
${FAQ_PROMPT_END}`;
}
