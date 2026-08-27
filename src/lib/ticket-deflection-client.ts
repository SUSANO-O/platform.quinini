/**
 * Llamada server-to-server a matias-backend para chequear si un problema
 * ya tiene una solución conocida (con buena confianza) en el RAG del
 * agente — ver matias-backend/src/routes/mcpConnections.ts (POST
 * /api/mcp/ticket-deflection-check) y ai/services/ticket-deflection.ts.
 *
 * Fail-open: cualquier error (timeout, backend caído, respuesta rara) se
 * traduce en `{ confident: false }` — el llamador sigue con el flujo
 * normal de abrir el ticket directo, nunca bloquea al usuario por esto.
 */
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';

export type DeflectionCheckResult =
  | { confident: true; sourceText: string; score: number }
  | { confident: false };

export async function checkTicketDeflection(params: {
  agentId: string;
  query: string;
}): Promise<DeflectionCheckResult> {
  const base = getAibackhubBaseUrl();
  if (!base) return { confident: false };

  try {
    const res = await fetch(`${base}/api/mcp/ticket-deflection-check`, {
      method: 'POST',
      headers: { ...hubCreateHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: params.agentId, query: params.query }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { confident: false };
    const data = (await res.json()) as {
      data?: { confident?: boolean; sourceText?: string; score?: number };
      confident?: boolean;
      sourceText?: string;
      score?: number;
    };
    // El helper sendSuccess() del hub envuelve la respuesta en { data: ... };
    // se toleran ambas formas por si el wrapper cambia.
    const payload = data.data ?? data;
    if (payload?.confident === true && typeof payload.sourceText === 'string' && payload.sourceText.trim()) {
      return { confident: true, sourceText: payload.sourceText, score: payload.score ?? 0 };
    }
    return { confident: false };
  } catch {
    return { confident: false };
  }
}
