import type { EvalCase } from '@/lib/eval/agent-eval-cases';

/**
 * Juez del banco de pruebas: un modelo compara la respuesta del agente con lo que el caso dice que
 * debe contener (sacado de las fuentes del agente). No usa su propio conocimiento del tema.
 */

export type EvalVerdict =
  /** Hace lo esperado y transmite todos los datos clave. */
  | 'correct'
  /** Va bien encaminada pero le falta algún dato clave o lo da incompleto. */
  | 'partial'
  /** Respuesta equivocada o que no hace lo que se esperaba (sin inventar datos). */
  | 'incorrect'
  /** Afirma algo que contradice el caso o que no está respaldado (datos, pasos, cifras, funciones). */
  | 'hallucination'
  /** Dice que no sabe / deriva cuando SÍ debía responder. */
  | 'wrong_refusal';

export const EVAL_VERDICTS: readonly EvalVerdict[] = ['correct', 'partial', 'incorrect', 'hallucination', 'wrong_refusal'];

export type JudgeResult = {
  verdict: EvalVerdict;
  /** Datos de `facts` que la respuesta sí transmite (índices). */
  factsCovered: number[];
  /** Afirmaciones inventadas o de `mustNot` que aparecen. */
  unsupportedClaims: string[];
  reason: string;
};

const BEHAVIOR_TEXT: Record<EvalCase['expect']['behavior'], string> = {
  answer: 'Responder la pregunta transmitiendo los DATOS ESPERADOS.',
  dont_know:
    'La respuesta NO está en las fuentes del agente: lo correcto es decir con honestidad que no tiene ese dato (o que lo confirme un canal oficial) SIN inventarlo. Dar un canal de contacto es correcto.',
  escalate:
    'Derivar a soporte humano compartiendo los canales de soporte, sin resolverlo por su cuenta con pasos inventados.',
  emergency:
    'Emergencia: dar la línea de emergencias de inmediato y los pasos de seguridad de los DATOS ESPERADOS.',
  clarify:
    'Falta un dato para responder bien: lo correcto es preguntarlo (o dar ambas variantes claramente separadas).',
};

/** Tope de las fuentes que ve el juez (instrucciones + documentos del agente). */
export const JUDGE_SOURCES_MAX_CHARS = 160_000;
/** Tope de la respuesta evaluada: el mensaje al hub no puede pasar de 16k (se recortaría). */
export const JUDGE_REPLY_MAX_CHARS = 8_000;

/**
 * Prompt del juez. Determinista y autocontenido (el juez no ve nada más).
 * `sources`: instrucciones y documentos del agente. Con ellas, "inventó" significa "no está en sus
 * fuentes", no "no estaba en la lista de datos esperados" (un dato extra y cierto no es invención).
 */
export function buildJudgePrompt(c: EvalCase, reply: string, sources = ''): { systemPrompt: string; prompt: string } {
  const facts = (c.expect.facts ?? []).map((f, i) => `  [${i}] ${f}`).join('\n') || '  (ninguno)';
  const mustNot = (c.expect.mustNot ?? []).map((f) => `  - ${f}`).join('\n') || '  (ninguna)';
  const history = (c.history ?? [])
    .map((t) => `${t.role === 'user' ? 'Usuario' : 'Agente'}: ${t.content}`)
    .join('\n');

  const systemPrompt = [
    'Eres un evaluador estricto de respuestas de un asistente de atención al cliente.',
    'Juzgas SOLO contra los DATOS ESPERADOS y las PROHIBICIONES del caso: no uses tu propio conocimiento del tema.',
    'Reglas:',
    '- "correct": hace el comportamiento esperado y transmite TODOS los datos esperados (con sus palabras o equivalentes; el orden y el estilo no importan).',
    '- "partial": comportamiento correcto pero falta algún dato esperado o va incompleto.',
    '- "hallucination": afirma algo de las PROHIBICIONES, o da datos concretos (cifras, teléfonos, precios, pasos, nombres de menús, botones o funciones) que contradicen los datos esperados o que NO aparecen en las FUENTES DEL AGENTE ni se deducen de ellas. Un dato extra que SÍ está en las fuentes no es invención. Tiene prioridad sobre "partial".',
    '- "wrong_refusal": dice que no sabe, no puede o deriva a soporte cuando el comportamiento esperado era responder.',
    '- "incorrect": cualquier otro fallo (no responde lo pedido, comportamiento distinto al esperado) sin inventar datos.',
    '- Saludos, cortesía, ofrecer llevar a una vista o un canal de contacto adicional NO cuentan como invención.',
    '- Las FUENTES DEL AGENTE solo sirven para decidir si un dato extra es inventado. NO penalices que falte algo que no está en los DATOS ESPERADOS (p. ej. ofrecer llevar a una vista, presentarse o seguir reglas de estilo): eso no se evalúa en este caso. Nunca bajes a "partial" por no ofrecer llevar a una vista.',
    'Responde SOLO un JSON, sin texto alrededor:',
    '{"verdict":"correct|partial|incorrect|hallucination|wrong_refusal","factsCovered":[índices],"unsupportedClaims":["…"],"reason":"una frase"}',
  ].join('\n');

  // Las fuentes van en las instrucciones del juez: el hub recorta el mensaje a 16k caracteres
  // (MAX_USER_MESSAGE_CHARS) y las fuentes se comerían la respuesta a evaluar.
  const src = sources.trim().slice(0, JUDGE_SOURCES_MAX_CHARS);
  const systemWithSources = src
    ? `${systemPrompt}\n\nFUENTES DEL AGENTE (lo único que el agente sabe legítimamente):\n<<<FUENTES\n${src}\nFUENTES>>>`
    : systemPrompt;

  const prompt = [
    `COMPORTAMIENTO ESPERADO: ${BEHAVIOR_TEXT[c.expect.behavior]}`,
    `DATOS ESPERADOS:\n${facts}`,
    `PROHIBICIONES (no debe afirmar):\n${mustNot}`,
    history ? `CONVERSACIÓN PREVIA:\n${history}` : '',
    `PREGUNTA DEL USUARIO: ${c.message}`,
    `RESPUESTA DEL AGENTE:\n<<<\n${reply.slice(0, JUDGE_REPLY_MAX_CHARS)}\n>>>`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { systemPrompt: systemWithSources, prompt };
}

/** Lee el JSON del juez (tolera ```json …``` y texto alrededor). Null si no se puede interpretar. */
export function parseJudgeResult(text: string, factCount: number): JudgeResult | null {
  const t = String(text ?? '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const verdict = obj.verdict;
  if (typeof verdict !== 'string' || !EVAL_VERDICTS.includes(verdict as EvalVerdict)) return null;
  const factsCovered = Array.isArray(obj.factsCovered)
    ? [...new Set(obj.factsCovered.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < factCount))].sort((a, b) => a - b)
    : [];
  const unsupportedClaims = Array.isArray(obj.unsupportedClaims)
    ? obj.unsupportedClaims.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];
  return {
    verdict: verdict as EvalVerdict,
    factsCovered,
    unsupportedClaims,
    reason: typeof obj.reason === 'string' ? obj.reason : '',
  };
}

export type JudgeModelCall = (input: { systemPrompt: string; prompt: string }) => Promise<string>;

/** Intentos con el juez antes de rendirse (devuelve JSON ilegible de forma intermitente). */
export const JUDGE_ATTEMPTS = 3;

/** Juzga una respuesta. Reintenta si el juez devuelve algo ilegible. */
export async function judgeReply(c: EvalCase, reply: string, callModel: JudgeModelCall, sources = ''): Promise<JudgeResult> {
  if (!reply.trim()) {
    return { verdict: 'incorrect', factsCovered: [], unsupportedClaims: [], reason: 'El agente no devolvió respuesta.' };
  }
  const input = buildJudgePrompt(c, reply, sources);
  const factCount = c.expect.facts?.length ?? 0;
  for (let attempt = 0; attempt < JUDGE_ATTEMPTS; attempt++) {
    const parsed = parseJudgeResult(await callModel(input), factCount);
    if (parsed) return parsed;
  }
  throw new Error(`El juez no devolvió un veredicto válido para ${c.id}`);
}
