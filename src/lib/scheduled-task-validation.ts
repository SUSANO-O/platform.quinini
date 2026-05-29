/**
 * Validación/saneamiento del `action.config` de una Tarea Programada según su tipo.
 * Usado por las rutas CRUD (POST/PATCH). Cada tipo de acción define su forma.
 */
import { ACTION_TYPES, type ActionType } from '@/lib/scheduling';

export interface SanitizedAction {
  type: ActionType;
  config: Record<string, unknown>;
}

type Result = { ok: true; value: SanitizedAction } | { ok: false; error: string };

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function sanitizeAction(input: unknown): Result {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'action es requerido.' };
  }
  const a = input as { type?: unknown; config?: unknown };
  const type = a.type as ActionType;
  if (!ACTION_TYPES.includes(type)) {
    return { ok: false, error: `Tipo de acción inválido. Permitidos: ${ACTION_TYPES.join(', ')}.` };
  }
  const cfg = (a.config && typeof a.config === 'object' ? a.config : {}) as Record<string, unknown>;

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
      return { ok: true, value: { type, config: { url, method, headers, bodyTemplate: str(cfg.bodyTemplate, 8000) } } };
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
    default:
      return { ok: false, error: 'Tipo de acción no soportado.' };
  }
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
