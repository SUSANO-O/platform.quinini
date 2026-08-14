/**
 * Recall de memoria conversacional para el camino de inferencia directa.
 *
 * Ese camino ya escribia memoria al terminar cada turno (afterWidgetChatSuccess)
 * pero nunca la leia: el agente solo recordaba lo que cupiera en el historial que
 * manda el widget, y olvidaba el resto. Los otros dos caminos si recuerdan —el de
 * MCP porque AIBackHub hace el recall dentro de executeWidgetChatRun, y el del hub
 * a traves de /chat/prepare— asi que aqui se reutiliza el mismo endpoint para que
 * los tres se comporten igual.
 */

import { getAibackhubBaseUrl, hubCreateHeaders, hubFetch } from '@/lib/aibackhub-sync';

const RECALL_TIMEOUT_MS = 6_000;
const RECALL_TOP_K = 3;

/**
 * Los saludos y mensajes triviales no justifican el coste del embedding de la
 * query, y sin sessionId el recall no puede acotarse a esta conversacion.
 */
export function shouldRecallConversationMemory(params: {
  trivial: boolean;
  sessionId: string;
}): boolean {
  return !params.trivial && params.sessionId.trim().length > 0;
}

/** Une contexto de sesion y memoria descartando bloques vacios o repetidos. */
export function mergeContextBlocks(...blocks: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of blocks) {
    const block = typeof raw === 'string' ? raw.trim() : '';
    if (!block || seen.has(block)) continue;
    seen.add(block);
    out.push(block);
  }
  return out.join('\n\n');
}

/**
 * Devuelve el bloque de memoria listo para inyectar, o cadena vacia.
 * Nunca lanza: la memoria es best-effort y no debe tumbar el chat.
 */
export async function recallConversationContextBlock(params: {
  agentId: string;
  query: string;
  sessionId: string;
  visitorId?: string;
}): Promise<string> {
  if (!getAibackhubBaseUrl()) return '';

  const agentId = params.agentId.trim();
  const sessionId = params.sessionId.trim();
  const query = params.query.trim();
  if (!agentId || !sessionId || !query) return '';

  try {
    const res = await hubFetch(
      '/api/embeddings/memory/recall',
      {
        method: 'POST',
        headers: hubCreateHeaders(),
        body: JSON.stringify({
          agentId,
          query,
          sessionId,
          ...(params.visitorId?.trim() ? { visitorId: params.visitorId.trim() } : {}),
          topK: RECALL_TOP_K,
        }),
      },
      RECALL_TIMEOUT_MS,
    );
    if (!res.ok) return '';

    const json = (await res.json().catch(() => ({}))) as {
      data?: { contextBlock?: unknown };
    };
    const block = json?.data?.contextBlock;
    return typeof block === 'string' ? block.trim() : '';
  } catch {
    return '';
  }
}
