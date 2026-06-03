/**
 * Helper para registrar métricas de inferencia (tokens, latencia, tools, costo).
 * Fire-and-forget: nunca debe bloquear la respuesta del chat al usuario.
 *
 * Usar al final de un request al LLM, sea cual sea el path (direct MCP,
 * proxy stream, proxy non-stream, inferencia directa).
 */

import { InferenceMetric } from '@/lib/db/models';

export interface MetricInput {
  userId: string;
  agentId: string;
  widgetId?: string | null;
  sessionId?: string | null;
  traceId?: string | null;

  model?: string;
  provider?: string;

  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;

  systemChars?: number;
  toolDefsChars?: number;
  historyTurns?: number;
  ragChars?: number;

  toolRounds?: number;
  toolsUsed?: string[];

  costUsd?: number | null;
  latencyMs?: number;

  ok?: boolean;
  errorCode?: string | null;
  path?: 'direct-mcp' | 'stream-proxy' | 'non-stream-proxy' | 'inference-direct' | string;
}

export function logInferenceMetric(m: MetricInput): void {
  void (async () => {
    try {
      await InferenceMetric.create({
        userId: m.userId,
        agentId: m.agentId,
        widgetId: m.widgetId ?? null,
        sessionId: m.sessionId ?? null,
        traceId: m.traceId ?? null,
        model: m.model ?? '',
        provider: m.provider ?? '',
        inputTokens: m.inputTokens ?? null,
        outputTokens: m.outputTokens ?? null,
        totalTokens: m.totalTokens ?? (m.inputTokens != null && m.outputTokens != null ? m.inputTokens + m.outputTokens : null),
        systemChars: m.systemChars ?? 0,
        toolDefsChars: m.toolDefsChars ?? 0,
        historyTurns: m.historyTurns ?? 0,
        ragChars: m.ragChars ?? 0,
        toolRounds: m.toolRounds ?? 0,
        toolsUsed: Array.isArray(m.toolsUsed) ? m.toolsUsed.slice(0, 20) : [],
        costUsd: m.costUsd ?? null,
        latencyMs: m.latencyMs ?? 0,
        ok: m.ok !== false,
        errorCode: m.errorCode ?? null,
        path: m.path ?? '',
      });
    } catch (e) {
      // No spamear logs si la inserción falla — métricas son best-effort
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[inference-metrics] insert failed:', e instanceof Error ? e.message : String(e));
      }
    }
  })();
}

/** Estimación cruda de tokens (1 token ≈ 4 chars). Útil cuando el provider no los devuelve. */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}
