/**
 * Verificación de la identidad firmada contra el secreto del widget (Mongo).
 * La usan /api/widget/chat y /api/widget/chat/stream: cualquier ruta que reenvíe el chat al
 * hub debe pasar por aquí y entregar los claims como parámetro, nunca dentro del cuerpo.
 */

import { Widget } from '@/lib/db/models';
import { logSecurityEvent } from '@/lib/security-log';
import { verifyWidgetIdentity } from '@/lib/widget-identity';

/**
 * Estado de la identidad en este mensaje, para diagnóstico (viaja al hub y se registra en sus logs;
 * nunca incluye valores ni la firma): `absent` (la página no envió identity), `verified`,
 * `rejected:<motivo>` (firma, expirada, widget_sin_secreto…), `error`.
 */
export type WidgetIdentityStatus = 'absent' | 'verified' | `rejected:${string}` | 'error' | 'not_checked';

export async function resolveVerifiedWidgetIdentity(params: {
  widgetId: string;
  signedIdentity: unknown;
  ip?: string;
  origin?: string;
  agentId?: string;
  ownerUserId?: string;
}): Promise<{ claims?: Record<string, string>; status: WidgetIdentityStatus }> {
  if (params.signedIdentity === undefined) return { status: 'absent' };
  try {
    const sec = (await Widget.findById(params.widgetId).select('+identitySecret').lean()) as {
      identitySecret?: string | null;
    } | null;
    const verified = verifyWidgetIdentity(params.signedIdentity, sec?.identitySecret);
    if (verified.ok) return { claims: verified.claims, status: 'verified' };
    logSecurityEvent({
      event: 'signature_invalid',
      ip: params.ip,
      origin: params.origin,
      agentId: params.agentId,
      userId: params.ownerUserId,
      code: `IDENTITY_${verified.reason.toUpperCase()}`,
    });
    return { status: `rejected:${verified.reason}` };
  } catch (err) {
    console.warn('[widget-identity] verify skipped:', err);
    return { status: 'error' };
  }
}
