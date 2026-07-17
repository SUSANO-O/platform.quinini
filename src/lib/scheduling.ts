/**
 * Helpers de scheduling para Tareas Programadas (cron por agente).
 *
 * Compartido entre el wizard de la UI (construir cron amigable), las rutas CRUD
 * (validar + calcular nextRunAt) y la lectura de estado. El worker `cron-schedule`
 * tiene su propia copia equivalente de computeNextRun (repo separado).
 */
import { parseExpression } from 'cron-parser';

export const DEFAULT_TIMEZONE = 'America/Bogota';

/**
 * Tipos de acción soportados (extensible: añadir aquí + handler en el worker).
 *
 * Contrato worker `cron-schedule` (repo aparte):
 * - Ejecutar `action.type` + `action.config`
 * - Si hay `action.then[]`, tras éxito ejecutar cada paso en serie
 * - En plantillas de pasos then: `{{prev.output}}` = resumen del paso anterior
 */
export const ACTION_TYPES = ['webhook', 'agent_run', 'chat_message', 'email'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** Frecuencias amigables que el wizard traduce a una cron expression. */
export type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface FriendlySchedule {
  frequency: Frequency;
  /** Minuto 0-59 (para hourly) o minuto de la hora elegida. */
  minute?: number;
  /** Hora 0-23 (daily/weekly/monthly). */
  hour?: number;
  /** Día de la semana 0-6 (0=domingo) para weekly. */
  dayOfWeek?: number;
  /** Día del mes 1-31 para monthly. */
  dayOfMonth?: number;
}

/** Construye una cron expression de 5 campos a partir de inputs amigables del wizard. */
export function buildCron(s: FriendlySchedule): string {
  const m = clamp(s.minute ?? 0, 0, 59);
  const h = clamp(s.hour ?? 9, 0, 23);
  switch (s.frequency) {
    case 'hourly':
      return `${m} * * * *`;
    case 'daily':
      return `${m} ${h} * * *`;
    case 'weekly':
      return `${m} ${h} * * ${clamp(s.dayOfWeek ?? 1, 0, 6)}`;
    case 'monthly':
      return `${m} ${h} ${clamp(s.dayOfMonth ?? 1, 1, 31)} * *`;
    default:
      return `${m} ${h} * * *`;
  }
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** Valida una cron expression + timezone. */
export function validateCron(cron: string, timezone: string = DEFAULT_TIMEZONE): { ok: true } | { ok: false; error: string } {
  if (typeof cron !== 'string' || !cron.trim()) {
    return { ok: false, error: 'La expresión cron es requerida.' };
  }
  try {
    parseExpression(cron.trim(), { tz: timezone });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Expresión cron o zona horaria inválida.' };
  }
}

/**
 * Calcula la próxima fecha de ejecución (UTC) para una cron expression en una timezone.
 * `from` permite calcular desde un instante distinto a "ahora" (útil en reprogramación).
 */
export function computeNextRun(
  cron: string,
  timezone: string = DEFAULT_TIMEZONE,
  from: Date = new Date(),
): Date {
  const it = parseExpression(cron, { tz: timezone, currentDate: from });
  return it.next().toDate();
}

// ── Límites / acceso por plan ────────────────────────────────────────────────
// Fuente única: plan-catalog.ts (incluye override por subscription.features).
export {
  scheduledTasksEnabled,
  getScheduledTaskLimit,
  effectiveScheduledTaskLimit,
  getScheduledTaskMinIntervalMin,
  SCHEDULED_TASKS_FEATURE,
} from '@/lib/plan-catalog';

/**
 * Intervalo real (minutos) entre corridas de una cron expression: mínimo de los
 * gaps de las próximas N ocurrencias (exacto para horarios de período fijo).
 */
export function cronIntervalMinutes(cron: string, timezone: string = DEFAULT_TIMEZONE): number {
  const it = parseExpression(cron, { tz: timezone });
  let prev = it.next().toDate().getTime();
  let min = Infinity;
  for (let i = 0; i < 5; i++) {
    const next = it.next().toDate().getTime();
    min = Math.min(min, (next - prev) / 60_000);
    prev = next;
  }
  return Math.round(min);
}

/** Valida que el cron no sea más frecuente que el mínimo permitido por el plan. */
export function validateCronInterval(
  cron: string,
  timezone: string,
  minIntervalMin: number,
): { ok: true } | { ok: false; error: string } {
  try {
    const interval = cronIntervalMinutes(cron, timezone);
    if (interval < minIntervalMin) {
      const human = minIntervalMin >= 60 ? `${minIntervalMin / 60} h` : `${minIntervalMin} min`;
      return { ok: false, error: `Tu plan permite una frecuencia mínima de ${human} entre ejecuciones.` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo validar la frecuencia.' };
  }
}
