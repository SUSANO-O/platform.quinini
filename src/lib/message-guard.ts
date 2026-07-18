/**
 * Validaciones de contenido del mensaje del usuario antes de enviarlo al modelo.
 *
 * - Límite de longitud por mensaje (MAX_MESSAGE_CHARS)
 * - Límite de turnos por sesión (MAX_TURNS_PER_SESSION)
 * - Detección básica de prompt injection
 */

import { isLocalDevLimitsBypass } from '@/lib/dev-limits';

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

/** Cuenta turnos del visitante en el formato del widget ({ message, history }). */
export function countWidgetUserTurns(parsed: Record<string, unknown>): number {
  let count = 0;
  if (Array.isArray(parsed.history)) {
    for (const m of parsed.history) {
      if (!m || typeof m !== 'object') continue;
      const role = String((m as { role?: string }).role || '').toLowerCase();
      if (role === 'user') count++;
    }
  }
  const msg = typeof parsed.message === 'string' ? parsed.message.trim() : '';
  const hasImages =
    Array.isArray(parsed.userImages) &&
    (parsed.userImages as unknown[]).some(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as { url?: unknown }).url === 'string' &&
        /^https?:\/\//i.test(String((item as { url: string }).url)),
    );
  if (msg || hasImages) count++;
  return count;
}

/**
 * Extrae y valida el mensaje del usuario desde el body del widget chat.
 * Compatible con los formatos message (string) y messages[] (array).
 * Permite mensaje vacío si hay userImages (captura sin texto).
 */
export function extractAndGuardMessage(rawBody: string): GuardResult & { text?: string; turnCount?: number; hasImages?: boolean } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, code: 'INVALID_JSON', message: 'Cuerpo JSON inválido.' };
  }

  const hasImages =
    Array.isArray(parsed.userImages) &&
    (parsed.userImages as unknown[]).some(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as { url?: unknown }).url === 'string' &&
        /^https?:\/\//i.test(String((item as { url: string }).url)),
    );

    const turnCount = countWidgetUserTurns(parsed);

    if (!isLocalDevLimitsBypass() && turnCount > MAX_TURNS_PER_SESSION) {
      return {
        ok: false,
        code: 'SESSION_TURN_LIMIT',
        message: `Esta conversación ha alcanzado el límite de ${MAX_TURNS_PER_SESSION} turnos. Inicia una nueva conversación.`,
      };
    }

  // Formato 1: { message: "texto" }
  if (typeof parsed.message === 'string') {
    const trimmed = parsed.message.trim();
    if (!trimmed && !hasImages) {
      return { ok: false, code: 'EMPTY_MESSAGE', message: 'El mensaje no puede estar vacío.' };
    }
    if (trimmed) {
      const result = guardUserMessage(parsed.message);
      const turnCount = countWidgetUserTurns(parsed);
      return result.ok ? { ok: true, text: parsed.message, turnCount, hasImages } : result;
    }
    return { ok: true, text: '', turnCount: countWidgetUserTurns(parsed), hasImages: true };
  }

  // Formato 2: { messages: [{ role, content }] }
  if (Array.isArray(parsed.messages)) {
    const userMsgs = (parsed.messages as { role?: string; content?: unknown }[])
      .filter(m => m.role === 'user');

    const turnCount = userMsgs.length;

    if (!isLocalDevLimitsBypass() && turnCount > MAX_TURNS_PER_SESSION) {
      return {
        ok: false,
        code: 'SESSION_TURN_LIMIT',
        message: `Esta conversación ha alcanzado el límite de ${MAX_TURNS_PER_SESSION} turnos. Inicia una nueva conversación.`,
      };
    }

    // Validar el último mensaje del usuario
    const lastUserMsg = userMsgs[userMsgs.length - 1];
    const text = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
    if (!text.trim() && !hasImages) {
      return { ok: false, code: 'EMPTY_MESSAGE', message: 'El mensaje no puede estar vacío.' };
    }
    if (text.trim()) {
      const result = guardUserMessage(text);
      return result.ok ? { ok: true, text, turnCount, hasImages } : result;
    }
    return { ok: true, text: '', turnCount, hasImages: true };
  }

  return { ok: true, hasImages };
}
