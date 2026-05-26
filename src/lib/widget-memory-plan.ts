/**
 * Límites de memoria de trabajo (turnos en ventana) según plan del dueño del widget.
 */

import { PLAN_HISTORY_RETENTION_DAYS, type PlanId } from '@/lib/plan-catalog';

/** Turnos de usuario máximos enviados al modelo por sesión (working memory). */
export const PLAN_WIDGET_HISTORY_TURNS: Record<string, number> = {
  free: 20,
  solo: 25,
  basic: 30,
  team: 40,
  plus: 45,
  starter: 50,
  growth: 55,
  business: 60,
  enterprise: 60,
};

export function maxWidgetHistoryTurns(plan: string): number {
  return PLAN_WIDGET_HISTORY_TURNS[plan] ?? PLAN_WIDGET_HISTORY_TURNS.free;
}

export function historyRetentionDays(plan: string): number {
  return PLAN_HISTORY_RETENTION_DAYS[plan as PlanId] ?? PLAN_HISTORY_RETENTION_DAYS.free;
}
