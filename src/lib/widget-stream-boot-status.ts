import type { WidgetChatStatusPhase } from '@/lib/widget-chat-status';

/**
 * Fases que la landing NO debe emitir solo por heurística del mensaje
 * (antes de saber si habrá RAG/tools/model reales).
 * hub/tools/mcp tras prepare cuentan como trabajo del motor, no como adorno.
 */
export const FORBIDDEN_ANTICIPATORY_STREAM_PHASES: ReadonlySet<WidgetChatStatusPhase> = new Set([
  'rag',
  'model',
  'vision',
  'skills',
]);

/** Primera fase permitida al abrir el SSE (Fase 0 narrativa). */
export const STREAM_BOOT_STATUS_PHASE: WidgetChatStatusPhase = 'prepare';

/**
 * Valida el prefijo de status del stream: prepare primero;
 * sin fases anticipadas de adorno (rag/model/vision/skills) antes del trabajo real.
 * hub/tools/mcp/triage justo tras prepare son honestos (motor o multiagente).
 */
export function assertHonestStreamBootStatuses(
  phases: string[],
): { ok: true } | { ok: false; reason: string } {
  if (!phases.length) {
    return { ok: false, reason: 'sin status' };
  }
  if (phases[0] !== STREAM_BOOT_STATUS_PHASE) {
    return { ok: false, reason: `primer status debe ser prepare, fue ${phases[0]}` };
  }
  for (let i = 1; i < phases.length; i++) {
    const p = phases[i] as WidgetChatStatusPhase;
    if (
      p === 'resolve' ||
      p === 'triage' ||
      p === 'handoff' ||
      p === 'parallel' ||
      p === 'pipeline' ||
      p === 'hub' ||
      p === 'tools' ||
      p === 'mcp'
    ) {
      break;
    }
    // Adornos típicos de la landing vieja antes de llamar al motor.
    if (p === 'rag' || p === 'model' || p === 'vision' || p === 'skills') {
      return { ok: false, reason: `status anticipatorio tras prepare: ${p}` };
    }
  }
  return { ok: true };
}

/** Contrato landing: al boot solo emitir prepare (multiagente puede añadir triage). */
export function landingBootStatusPhases(multiAgentEnabled: boolean): WidgetChatStatusPhase[] {
  const out: WidgetChatStatusPhase[] = [STREAM_BOOT_STATUS_PHASE];
  if (multiAgentEnabled) out.push('triage');
  return out;
}
