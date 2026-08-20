/**
 * Observabilidad por turno del widget (Fase 4):
 * path + fases SSE + tools + estimación de tokens + honestidad de status.
 */

import { assertHonestStreamBootStatuses } from '@/lib/widget-stream-boot-status';

/** Heurística estable (~4 chars/token) para logs sin depender del proveedor. */
export function estimatePromptTokensFromChars(chars: number): number {
  const n = Number.isFinite(chars) ? Math.max(0, Math.floor(chars)) : 0;
  return Math.ceil(n / 4);
}

export function evaluateSseStatusHonesty(phases: string[]): {
  statusHonest: boolean;
  lyingReason: string | null;
} {
  const list = Array.isArray(phases) ? phases.map(String).filter(Boolean) : [];
  if (!list.length) {
    return { statusHonest: true, lyingReason: null };
  }
  const check = assertHonestStreamBootStatuses(list);
  if (check.ok) return { statusHonest: true, lyingReason: null };
  return { statusHonest: false, lyingReason: check.reason };
}

export type WidgetTurnObsFields = {
  event: 'widget_turn_obs';
  path: string;
  ssePhases: string[];
  statusHonest: boolean;
  lyingReason: string | null;
  toolsUsed: string[];
  toolCount: number;
  promptChars: number | null;
  promptTokensEst: number | null;
  inputTokens: number | null;
  replyLen: number | null;
  totalMs: number | null;
};

export function buildWidgetTurnObsFields(input: {
  path?: string | null;
  ssePhases?: string[] | null;
  toolsUsed?: string[] | null;
  promptChars?: number | null;
  inputTokens?: number | null;
  replyLen?: number | null;
  totalMs?: number | null;
}): WidgetTurnObsFields {
  const ssePhases = Array.isArray(input.ssePhases)
    ? input.ssePhases.map(String).filter(Boolean).slice(0, 40)
    : [];
  const toolsUsed = Array.isArray(input.toolsUsed)
    ? [...new Set(input.toolsUsed.map(String).filter(Boolean))].slice(0, 40)
    : [];
  const promptChars =
    input.promptChars != null && Number.isFinite(input.promptChars)
      ? Math.max(0, Math.floor(input.promptChars))
      : null;
  const inputTokens =
    input.inputTokens != null && Number.isFinite(input.inputTokens)
      ? Math.max(0, Math.floor(input.inputTokens))
      : null;
  const honesty = evaluateSseStatusHonesty(ssePhases);

  return {
    event: 'widget_turn_obs',
    path: typeof input.path === 'string' ? input.path : '',
    ssePhases,
    statusHonest: honesty.statusHonest,
    lyingReason: honesty.lyingReason,
    toolsUsed,
    toolCount: toolsUsed.length,
    promptChars,
    promptTokensEst: promptChars != null ? estimatePromptTokensFromChars(promptChars) : null,
    inputTokens,
    replyLen:
      input.replyLen != null && Number.isFinite(input.replyLen)
        ? Math.max(0, Math.floor(input.replyLen))
        : null,
    totalMs:
      input.totalMs != null && Number.isFinite(input.totalMs)
        ? Math.max(0, Math.floor(input.totalMs))
        : null,
  };
}
