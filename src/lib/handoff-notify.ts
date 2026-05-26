/**
 * Destinos de notificación al pulsar «Hablar con una persona» en el widget.
 * El Inbox interno siempre recibe la escalación; esto controla canales externos.
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

/** Normaliza campos de soporte humano / escalación en respuestas API del widget. */
export function normalizeWidgetSupportFields<T extends Record<string, unknown>>(widget: T) {
  return {
    ...widget,
    handoffNotifyMode: normalizeHandoffNotifyMode(widget.handoffNotifyMode),
    handoffEnabled: widget.handoffEnabled !== false,
    humanSupportEnabled: widget.humanSupportEnabled !== false,
    fabDismissible: widget.fabDismissible !== false,
  };
}
