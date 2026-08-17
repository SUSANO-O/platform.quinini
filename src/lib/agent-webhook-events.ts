/**
 * Helpers UI para eventos de webhook del dashboard.
 */

import {
  EVENT_LEAD_CAPTURED,
  getEventDefinition,
  isEventActive,
  isServerOwnedEvent,
  normalizeEventId,
  webhookEventCatalogForUi,
} from '@/lib/agent-event-catalog';

/** Sin `events` explícitos: el agente elige por descripción (`webhook:<nombre>`). */
export const WEBHOOK_EVENT_AGENT_DECISION = 'agent_decision';

export type WebhookEventUiValue = string;

export const WEBHOOK_EVENT_GROUPS = webhookEventCatalogForUi();

export const WEBHOOK_AGENT_DECISION_OPTION = {
  value: WEBHOOK_EVENT_AGENT_DECISION,
  label: 'Decisión del agente',
  hint:
    'Sin evento fijo: el agente invoca este webhook según la descripción (noticias, flujos custom, confirmaciones).',
  serverOwned: false,
  status: 'active' as const,
};

export function primaryWebhookEvent(events: string[] | undefined): WebhookEventUiValue {
  if (!Array.isArray(events) || events.length === 0) return WEBHOOK_EVENT_AGENT_DECISION;
  const first = normalizeEventId(events[0] ?? '');
  if (getEventDefinition(first)) return first;
  return WEBHOOK_EVENT_AGENT_DECISION;
}

export function eventsFromUiValue(value: WebhookEventUiValue): string[] | undefined {
  if (!value || value === WEBHOOK_EVENT_AGENT_DECISION) return undefined;
  const norm = normalizeEventId(value);
  if (!getEventDefinition(norm)) return undefined;
  return [norm];
}

export function webhookEventMeta(value: WebhookEventUiValue) {
  if (value === WEBHOOK_EVENT_AGENT_DECISION) return WEBHOOK_AGENT_DECISION_OPTION;
  const def = getEventDefinition(value);
  if (!def) return WEBHOOK_AGENT_DECISION_OPTION;
  return {
    value: def.id,
    label: def.label,
    hint: def.description,
    serverOwned: isServerOwnedEvent(def.id),
    status: def.status,
  };
}

export function isWebhookEventSelectable(value: WebhookEventUiValue): boolean {
  if (value === WEBHOOK_EVENT_AGENT_DECISION) return true;
  return isEventActive(value);
}

export { isEventActive, isServerOwnedEvent, EVENT_LEAD_CAPTURED };
