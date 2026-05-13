/**
 * Audit log de eventos de seguridad del flujo de chat.
 *
 * Siempre best-effort (no bloquea la respuesta al cliente).
 * TTL de 90 días en MongoDB via índice `expires`.
 *
 * Eventos registrados:
 *   rate_limited          → IP supera límite de requests
 *   origin_not_allowed    → dominio no en allowlist del widget
 *   token_invalid         → wt_* no existe en BD
 *   quota_exceeded        → usuario agotó conversaciones del mes
 *   injection_detected    → mensaje con patrón de prompt injection
 *   turn_limit            → sesión superó MAX_TURNS_PER_SESSION
 *   message_too_long      → mensaje supera MAX_MESSAGE_CHARS
 *   signature_invalid     → firma HMAC inválida o expirada (server-to-server)
 */

import { connectDB } from '@/lib/db/connection';
import { SecurityLog } from '@/lib/db/models';

export type SecurityEvent =
  | 'rate_limited'
  | 'origin_not_allowed'
  | 'token_invalid'
  | 'quota_exceeded'
  | 'injection_detected'
  | 'turn_limit'
  | 'message_too_long'
  | 'signature_invalid';

export interface SecurityLogEntry {
  event: SecurityEvent;
  ip?: string;
  origin?: string;
  widgetId?: string;
  agentId?: string;
  userId?: string;
  code?: string;
  meta?: Record<string, unknown>;
}

/**
 * Registra un evento de seguridad de forma asíncrona (fire-and-forget).
 * No lanza excepciones; un fallo de log nunca debe interrumpir el flujo.
 */
export function logSecurityEvent(entry: SecurityLogEntry): void {
  void (async () => {
    try {
      await connectDB();
      await SecurityLog.create({
        event:    entry.event,
        ip:       entry.ip       || '',
        origin:   entry.origin   || '',
        widgetId: entry.widgetId || '',
        agentId:  entry.agentId  || '',
        userId:   entry.userId   || '',
        code:     entry.code     || '',
        meta:     entry.meta     || {},
      });
    } catch {
      // Silenciar — el logging nunca debe afectar al usuario
    }
  })();
}
