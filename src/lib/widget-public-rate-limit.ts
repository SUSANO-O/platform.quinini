import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';

/**
 * Límites de los endpoints públicos del widget que disparan avisos a personas (ticket en Slack,
 * aviso de handoff, email a soporte). Solo piden el token del widget, que es público (va en la
 * página), así que sin límite cualquiera podía llenar el Slack o el correo de un cliente.
 *
 * Dos cubos: por IP (un abusador) y por widget (muchas IPs contra el mismo cliente).
 * Holgados para uso real: una persona no abre más de un par de tickets por conversación.
 */
export type WidgetPublicAction = 'ticket' | 'handoff' | 'support-contact';

const WINDOW_MS = 10 * 60_000;
const WIDGET_WINDOW_MS = 60 * 60_000;

export const WIDGET_PUBLIC_LIMITS: Record<WidgetPublicAction, { perIp: number; perWidgetHour: number }> = {
  ticket: { perIp: 5, perWidgetHour: 60 },
  handoff: { perIp: 10, perWidgetHour: 120 },
  'support-contact': { perIp: 3, perWidgetHour: 20 },
};

export type WidgetPublicRateLimitResult = { ok: true } | { ok: false; retryAfter: number };

export async function checkWidgetPublicRateLimit(
  req: { headers: { get: (name: string) => string | null } },
  action: WidgetPublicAction,
  widgetId: string,
): Promise<WidgetPublicRateLimitResult> {
  const limits = WIDGET_PUBLIC_LIMITS[action];
  const ip = getClientIp(req);
  const byIp = await checkRateLimitAsync(`widget-${action}-ip`, `${widgetId}:${ip}`, limits.perIp, WINDOW_MS);
  if (!byIp.success) return { ok: false, retryAfter: byIp.retryAfter };
  const byWidget = await checkRateLimitAsync(`widget-${action}-widget`, widgetId, limits.perWidgetHour, WIDGET_WINDOW_MS);
  if (!byWidget.success) return { ok: false, retryAfter: byWidget.retryAfter };
  return { ok: true };
}

export const WIDGET_PUBLIC_RATE_LIMIT_MESSAGE = 'Recibimos muchas solicitudes seguidas. Intentá de nuevo en unos minutos.';
