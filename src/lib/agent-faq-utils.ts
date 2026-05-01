/**
 * FAQs del agente + bloque opcional de “candidatas” (preguntas repetidas sin FAQ formal).
 * Los marcadores se fusionan al system prompt igual que las reglas operativas.
 */

export const FAQ_PROMPT_START = '### [AFHUB_FAQ_START]';
export const FAQ_PROMPT_END = '### [AFHUB_FAQ_END]';

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
  /** Último texto de usuario visto (muestra legible). */
  questionSample: string;
  count: number;
  lastSeen: string;
  dismissed?: boolean;
};

export function normalizeFaqKey(text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 500);
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
  }
  return false;
}

const DEFAULT_MIN_CANDIDATE_IN_PROMPT = 3;

export function buildFaqPromptBlock(
  faqs: AgentFaqRow[],
  candidates: FaqCandidateRow[],
  minCandidateCount = DEFAULT_MIN_CANDIDATE_IN_PROMPT,
): string {
  const activeFaqs = (faqs || [])
    .filter((f) => f && f.enabled !== false && String(f.question || '').trim() && String(f.answer || '').trim())
    .sort((a, b) => a.priority - b.priority);

  const topCandidates = (candidates || [])
    .filter((c) => c && !c.dismissed && (c.count ?? 0) >= minCandidateCount && String(c.questionSample || '').trim())
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 12);

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
