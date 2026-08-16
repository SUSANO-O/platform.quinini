/**
 * Emisión progresiva de respuestas vía SSE (Fase 3).
 * El hub aún devuelve texto completo; aquí lo troceamos para que el widget
 * muestre tokens de forma incremental sin esperar streaming nativo del LLM.
 */

const MIN_CHARS_TO_CHUNK = 48;
const MAX_REVEAL_MS = 700;
const MIN_CHUNK_DELAY_MS = 6;
const MAX_CHUNK_DELAY_MS = 18;

/** Trocea texto preservando espacios (por grupos de ~3 palabras). */
export function splitTextForStreamTokens(text: string): string[] {
  const raw = String(text || '');
  if (!raw || raw.length < MIN_CHARS_TO_CHUNK) return raw ? [raw] : [];

  const parts: string[] = [];
  const tokens = raw.split(/(\s+)/);
  let buf = '';
  let wordCount = 0;

  for (const token of tokens) {
    buf += token;
    if (token.trim()) wordCount += 1;
    if (wordCount >= 3 && buf.length >= 20) {
      parts.push(buf);
      buf = '';
      wordCount = 0;
    }
  }
  if (buf) parts.push(buf);

  return parts.length > 0 ? parts : [raw];
}

export function streamChunkDelayMs(partCount: number): number {
  if (partCount <= 1) return 0;
  return Math.min(
    MAX_CHUNK_DELAY_MS,
    Math.max(MIN_CHUNK_DELAY_MS, Math.floor(MAX_REVEAL_MS / partCount)),
  );
}

export async function emitStreamTokensFromText(
  enqueue: (data: Record<string, unknown>) => void,
  text: string,
): Promise<void> {
  const parts = splitTextForStreamTokens(text);
  if (parts.length === 0) return;

  if (parts.length === 1) {
    enqueue({ type: 'token', text: parts[0] });
    return;
  }

  const delayMs = streamChunkDelayMs(parts.length);
  for (let i = 0; i < parts.length; i++) {
    enqueue({ type: 'token', text: parts[i] });
    if (i < parts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
