/**
 * Límites de memoria de trabajo (turnos en ventana) según plan del dueño del widget.
 */

import { PLAN_HISTORY_RETENTION_DAYS, type PlanId } from '@/lib/plan-catalog';

/**
 * Turnos de USUARIO máximos enviados al modelo por sesión (working memory).
 * Cada turno = 1 user message + su respuesta del asistente. A ~300-500 tokens/par,
 * estos límites controlan el costo y la calidad (historiales muy largos hacen
 * que el LLM ancle en patrones viejos).
 *
 * Para conversaciones más largas, el resto del contexto vive en sessionContextBlock
 * (resumen incremental) y en la memoria semántica (embeddings).
 */
export const PLAN_WIDGET_HISTORY_TURNS: Record<string, number> = {
  free:       6,
  solo:       8,
  basic:      10,
  team:       12,
  plus:       14,
  starter:    16,
  growth:     20,
  business:   24,
  enterprise: 32,
};

export function maxWidgetHistoryTurns(plan: string): number {
  return PLAN_WIDGET_HISTORY_TURNS[plan] ?? PLAN_WIDGET_HISTORY_TURNS.free;
}

export function historyRetentionDays(plan: string): number {
  return PLAN_HISTORY_RETENTION_DAYS[plan as PlanId] ?? PLAN_HISTORY_RETENTION_DAYS.free;
}
