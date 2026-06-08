/**
 * Destinos de notificación al pulsar «Hablar con una persona» en el widget.
 * El Inbox interno siempre recibe la escalación; esto controla canales externos.
 *
 * Solo funciones puras — importable desde componentes cliente (widget-builder).
 * La lógica con MongoDB/WhatsApp vive en handoff-whatsapp.ts (solo servidor).
 */

export type HandoffNotifyMode = 'inbox' | 'webhook' | 'slack' | 'both';

const MODES: HandoffNotifyMode[] = ['inbox', 'webhook', 'slack', 'both'];

export function normalizeHandoffNotifyMode(value: unknown): HandoffNotifyMode {
  if (typeof value === 'string' && (MODES as string[]).includes(value)) {
    return value as HandoffNotifyMode;
  }
  return 'both';
}

export function shouldDispatchHandoffWebhook(mode: HandoffNotifyMode): boolean {
  return mode === 'webhook' || mode === 'both';
}

export function shouldDispatchHandoffSlack(mode: HandoffNotifyMode): boolean {
  return mode === 'slack' || mode === 'both';
}

export const HANDOFF_NOTIFY_MODE_LABELS: Record<HandoffNotifyMode, string> = {
  inbox: 'Solo Inbox (panel BotIvA)',
  webhook: 'Webhook saliente',
  slack: 'Slack',
  both: 'Webhook + Slack',
};

/** Número público del widget (enlace wa.me al visitante). Widget primero, fallback al dueño. */
export function resolveWidgetHumanSupportPhone(
  widget: { humanSupportPhone?: unknown },
  user?: { escalationWhatsAppPhone?: unknown } | null,
): string {
  const widgetPhone =
    typeof widget.humanSupportPhone === 'string' ? widget.humanSupportPhone.trim() : '';
  if (widgetPhone) return widgetPhone.slice(0, 48);
  const userPhone =
    typeof user?.escalationWhatsAppPhone === 'string' ? user.escalationWhatsAppPhone.trim() : '';
  return userPhone ? userPhone.slice(0, 48) : '';
}

/** Número destino de alertas handoff: widget «WhatsApp humano» primero, luego Ajustes. */
export function resolveHandoffOwnerNotifyPhone(
  widget: { humanSupportPhone?: unknown },
  user?: { escalationWhatsAppPhone?: unknown } | null,
): string {
  const widgetPhone =
    typeof widget.humanSupportPhone === 'string' ? widget.humanSupportPhone.trim() : '';
  if (widgetPhone) return widgetPhone.slice(0, 48);
  const ownerPhone =
    typeof user?.escalationWhatsAppPhone === 'string' ? user.escalationWhatsAppPhone.trim() : '';
  return ownerPhone ? ownerPhone.slice(0, 48) : '';
}

/** Normaliza campos de soporte humano / escalación en respuestas API del widget. */
export function normalizeWidgetSupportFields<T extends Record<string, unknown>>(
  widget: T,
  user?: { escalationWhatsAppPhone?: unknown } | null,
) {
  const humanSupportPhone = resolveWidgetHumanSupportPhone(widget, user);
  return {
    ...widget,
    humanSupportPhone,
    handoffNotifyMode: normalizeHandoffNotifyMode(widget.handoffNotifyMode),
    handoffEnabled: widget.handoffEnabled !== false,
    humanSupportEnabled: widget.humanSupportEnabled !== false,
    fabDismissible: widget.fabDismissible !== false,
  };
}
