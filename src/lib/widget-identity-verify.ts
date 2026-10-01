/**
 * Verificación de la identidad firmada contra el secreto del widget (Mongo).
 * La usan /api/widget/chat y /api/widget/chat/stream: cualquier ruta que reenvíe el chat al
 * hub debe pasar por aquí y entregar los claims como parámetro, nunca dentro del cuerpo.
 */

import { Widget } from '@/lib/db/models';
import { logSecurityEvent } from '@/lib/security-log';
import { verifyWidgetIdentity } from '@/lib/widget-identity';

export async function resolveVerifiedWidgetIdentity(params: {
  widgetId: string;
  signedIdentity: unknown;
  ip?: string;
  origin?: string;
  agentId?: string;
  ownerUserId?: string;
}): Promise<Record<string, string> | undefined> {
  if (params.signedIdentity === undefined) return undefined;
  try {
    const sec = (await Widget.findById(params.widgetId).select('+identitySecret').lean()) as {
      identitySecret?: string | null;
    } | null;
    const verified = verifyWidgetIdentity(params.signedIdentity, sec?.identitySecret);
    if (verified.ok) return verified.claims;
    logSecurityEvent({
      event: 'signature_invalid',
      ip: params.ip,
      origin: params.origin,
      agentId: params.agentId,
      userId: params.ownerUserId,
      code: `IDENTITY_${verified.reason.toUpperCase()}`,
    });
  } catch (err) {
    console.warn('[widget-identity] verify skipped:', err);
  }
  return undefined;
}
