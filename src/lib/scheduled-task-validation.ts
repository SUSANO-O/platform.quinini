/**
 * Validación/saneamiento del `action` de una Tarea Programada.
 * Soporta 1 acción principal + cadena opcional `then[]` (flow corto).
 * El worker `cron-schedule` debe ejecutar: type → then[0] → then[1]… en serie.
 */
import { ACTION_TYPES, type ActionType } from '@/lib/scheduling';

export interface SanitizedActionStep {
  type: ActionType;
  config: Record<string, unknown>;
}

export interface SanitizedAction extends SanitizedActionStep {
  /** Pasos siguientes tras éxito del principal (máx. 3). */
  then?: SanitizedActionStep[];
}

type Result = { ok: true; value: SanitizedAction } | { ok: false; error: string };

const MAX_THEN_STEPS = 3;

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function sanitizeStepConfig(type: ActionType, cfg: Record<string, unknown>): Result {
  switch (type) {
    case 'webhook': {
      const url = str(cfg.url, 2000);
      if (!/^https?:\/\//i.test(url)) {
        return { ok: false, error: 'webhook.url debe ser una URL http(s) válida.' };
      }
      const method = ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'].includes(String(cfg.method).toUpperCase())
        ? String(cfg.method).toUpperCase()
        : 'POST';
      const headers =
        cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers)
          ? (cfg.headers as Record<string, unknown>)
          : {};
      return {
        ok: true,
        value: { type, config: { url, method, headers, bodyTemplate: str(cfg.bodyTemplate, 8000) } },
      };
    }
    case 'agent_run': {
      const prompt = str(cfg.prompt, 8000);
      if (!prompt) return { ok: false, error: 'agent_run.prompt es requerido.' };
      return { ok: true, value: { type, config: { prompt } } };
    }
    case 'chat_message': {
      const message = str(cfg.message, 8000);
      if (!message) return { ok: false, error: 'chat_message.message es requerido.' };
      return { ok: true, value: { type, config: { message } } };
    }
    case 'email': {
      const to = str(cfg.to, 320);
      const subject = str(cfg.subject, 300);
      const body = str(cfg.body, 16000);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        return { ok: false, error: 'email.to debe ser un correo válido.' };
      }
      if (!subject) return { ok: false, error: 'email.subject es requerido.' };
      if (!body) return { ok: false, error: 'email.body es requerido.' };
      return { ok: true, value: { type, config: { to, subject, body } } };
    }
    case 'calendar_reminder': {
      const to = str(cfg.to, 320);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        return { ok: false, error: 'calendar_reminder.to debe ser un correo válido.' };
      }
      const calendarId = str(cfg.calendarId, 200) || 'primary';
      const rawThresholds = Array.isArray(cfg.thresholdsMinutes) ? cfg.thresholdsMinutes : [30, 15, 5, 0];
      const thresholdsMinutes = [
        ...new Set(
          rawThresholds
            .map((n) => (typeof n === 'number' ? n : parseInt(String(n), 10)))
            .filter((n) => Number.isFinite(n) && n >= 0 && n <= 1440),
        ),
      ].slice(0, 10);
      if (thresholdsMinutes.length === 0) {
        return { ok: false, error: 'calendar_reminder.thresholdsMinutes debe tener al menos un valor válido (0-1440).' };
      }
      return {
        ok: true,
        value: { type, config: { to, calendarId, thresholdsMinutes: thresholdsMinutes.sort((a, b) => b - a) } },
      };
    }
    default:
      return { ok: false, error: 'Tipo de acción no soportado.' };
  }
}

export function sanitizeAction(input: unknown): Result {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'action es requerido.' };
  }
  const a = input as { type?: unknown; config?: unknown; then?: unknown };
  const type = a.type as ActionType;
  if (!ACTION_TYPES.includes(type)) {
    return { ok: false, error: `Tipo de acción inválido. Permitidos: ${ACTION_TYPES.join(', ')}.` };
  }
  const cfg = (a.config && typeof a.config === 'object' ? a.config : {}) as Record<string, unknown>;
  const primary = sanitizeStepConfig(type, cfg);
  if (!primary.ok) return primary;

  let then: SanitizedActionStep[] | undefined;
  if (Array.isArray(a.then)) {
    then = [];
    for (let i = 0; i < Math.min(a.then.length, MAX_THEN_STEPS); i++) {
      const raw = a.then[i];
      if (!raw || typeof raw !== 'object') {
        return { ok: false, error: `then[${i}] inválido.` };
      }
      const step = raw as { type?: unknown; config?: unknown };
      const stepType = step.type as ActionType;
      if (!ACTION_TYPES.includes(stepType)) {
        return { ok: false, error: `then[${i}].type inválido.` };
      }
      // agent_run / calendar_reminder solo como paso principal (necesitan correr
      // como el disparador del tick, no como reacción al éxito de otro paso).
      if (stepType === 'agent_run' || stepType === 'calendar_reminder') {
        return { ok: false, error: `${stepType} solo puede ser la acción principal, no un paso then.` };
      }
      const stepCfg =
        step.config && typeof step.config === 'object' ? (step.config as Record<string, unknown>) : {};
      const sanitized = sanitizeStepConfig(stepType, stepCfg);
      if (!sanitized.ok) {
        return { ok: false, error: `then[${i}]: ${sanitized.error}` };
      }
      then.push({ type: sanitized.value.type, config: sanitized.value.config });
    }
  }

  return {
    ok: true,
    value: {
      type: primary.value.type,
      config: primary.value.config,
      // [] limpia la cadena al editar; omitir then si el cliente no lo envió (compat).
      ...(then !== undefined ? { then } : {}),
    },
  };
}

export interface SanitizedRetryPolicy {
  maxRetries: number;
  backoff: 'fixed' | 'exponential';
  retryDelayMinutes: number;
}

export function sanitizeRetryPolicy(input: unknown): SanitizedRetryPolicy {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const maxRetries = clampInt(p.maxRetries, 0, 10, 3);
  const backoff = p.backoff === 'exponential' ? 'exponential' : 'fixed';
  const retryDelayMinutes = clampInt(p.retryDelayMinutes, 1, 1440, 5);
  return { maxRetries, backoff, retryDelayMinutes };
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** Etiqueta corta para UI: "Webhook → Email". */
export function describeActionFlow(action: {
  type?: string;
  then?: Array<{ type?: string }>;
}): string {
  const labels: Record<string, string> = {
    webhook: 'Webhook',
    agent_run: 'Agente',
    chat_message: 'Chat',
    email: 'Email',
    calendar_reminder: 'Recordatorio Calendario',
  };
  const primary = labels[action?.type || ''] || action?.type || '?';
  const rest = (Array.isArray(action?.then) ? action.then : [])
    .map((s) => labels[s?.type || ''] || s?.type)
    .filter(Boolean);
  return [primary, ...rest].join(' → ');
}
