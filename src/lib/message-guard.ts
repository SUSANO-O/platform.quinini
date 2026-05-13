/**
 * Validaciones de contenido del mensaje del usuario antes de enviarlo al modelo.
 *
 * - Límite de longitud por mensaje (MAX_MESSAGE_CHARS)
 * - Límite de turnos por sesión (MAX_TURNS_PER_SESSION)
 * - Detección básica de prompt injection
 */

export const MAX_MESSAGE_CHARS   = 4_000;
export const MAX_TURNS_PER_SESSION = 60;

// Patrones de prompt injection más comunes en español e inglés
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /ignora\s+(todas?\s+las?\s+)?instrucciones?\s+(anteriores?|previas?)/i,
  /you\s+are\s+now\s+(a\s+)?(different|new|unrestricted|dan|jailbreak)/i,
  /ahora\s+eres?\s+(un?\s+)?(diferente|nuevo|sin\s+restricciones?)/i,
  /act\s+as\s+(if\s+you\s+are\s+)?(dan|evil|unrestricted|jailbreak)/i,
  /actúa\s+como\s+si\s+(fueras?|eres?)\s+(dan|malicioso|sin\s+restricciones?)/i,
  /\bsystem\s*:\s*(you|eres?|sos|tu\s+eres?)/i,
  /\[system\]/i,
  /<\s*system\s*>/i,
  /\bdeveloper\s+mode\s+(enabled|on|activate)/i,
  /modo\s+desarrollador\s+(activado|habilitado)/i,
  /jailbreak/i,
  /prompt\s+injection/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /muestra?\s+(tu\s+)?(prompt|instrucciones?\s+del?\s+sistema)/i,
];

export type GuardResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * Valida el último mensaje del usuario (texto plano).
 */
export function guardUserMessage(text: string): GuardResult {
  if (!text || typeof text !== 'string') {
    return { ok: false, code: 'EMPTY_MESSAGE', message: 'El mensaje no puede estar vacío.' };
  }

  if (text.length > MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      code: 'MESSAGE_TOO_LONG',
      message: `El mensaje excede el límite de ${MAX_MESSAGE_CHARS.toLocaleString('es')} caracteres.`,
    };
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        ok: false,
        code: 'PROMPT_INJECTION_DETECTED',
        message: 'Tu mensaje contiene instrucciones no permitidas.',
      };
    }
  }

  return { ok: true };
}

/**
 * Extrae y valida el mensaje del usuario desde el body del widget chat.
 * Compatible con los formatos message (string) y messages[] (array).
 */
export function extractAndGuardMessage(rawBody: string): GuardResult & { text?: string; turnCount?: number } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, code: 'INVALID_JSON', message: 'Cuerpo JSON inválido.' };
  }

  // Formato 1: { message: "texto" }
  if (typeof parsed.message === 'string') {
    const result = guardUserMessage(parsed.message);
    return result.ok ? { ok: true, text: parsed.message, turnCount: 1 } : result;
  }

  // Formato 2: { messages: [{ role, content }] }
  if (Array.isArray(parsed.messages)) {
    const userMsgs = (parsed.messages as { role?: string; content?: unknown }[])
      .filter(m => m.role === 'user');

    const turnCount = userMsgs.length;

    if (turnCount > MAX_TURNS_PER_SESSION) {
      return {
        ok: false,
        code: 'SESSION_TURN_LIMIT',
        message: `Esta conversación ha alcanzado el límite de ${MAX_TURNS_PER_SESSION} turnos. Inicia una nueva conversación.`,
      };
    }

    // Validar el último mensaje del usuario
    const lastUserMsg = userMsgs[userMsgs.length - 1];
    const text = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
    const result = guardUserMessage(text);
    return result.ok ? { ok: true, text, turnCount } : result;
  }

  return { ok: true };
}
