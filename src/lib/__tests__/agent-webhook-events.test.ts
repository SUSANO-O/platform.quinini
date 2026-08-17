import { describe, expect, it } from 'vitest';
import { extractWebhookEntries } from '@/lib/agent-webhooks';
import {
  EVENT_LEAD_CAPTURED,
  AGENT_EVENT_CATALOG,
  webhookEventCatalogForUi,
} from '@/lib/agent-event-catalog';
import {
  WEBHOOK_EVENT_AGENT_DECISION,
  eventsFromUiValue,
  primaryWebhookEvent,
  webhookEventMeta,
} from '@/lib/agent-webhook-events';

describe('agent-event-catalog (landing)', () => {
  it('expone catálogo webhook para UI', () => {
    const groups = webhookEventCatalogForUi();
    expect(groups.some((g) => g.category === 'lead')).toBe(true);
    expect(AGENT_EVENT_CATALOG.length).toBeGreaterThan(10);
  });
});

describe('agent-webhook-events', () => {
  it('mapea lead_captured desde Mongo', () => {
    const entries = extractWebhookEntries({
      webhooks: [
        {
          id: 'wh_1',
          name: 'webhook_1',
          description: 'cuando da sus datos',
          url: 'https://example.test/hook',
          events: ['lead_captured'],
        },
      ],
    });
    expect(entries[0]?.events).toEqual(['lead_captured']);
    expect(primaryWebhookEvent(entries[0]?.events)).toBe(EVENT_LEAD_CAPTURED);
    expect(webhookEventMeta(EVENT_LEAD_CAPTURED).serverOwned).toBe(true);
  });

  it('sin events = decisión del agente', () => {
    const entries = extractWebhookEntries({
      webhooks: [{ id: 'wh_1', name: 'noticias', description: 'noticias del día', url: 'https://example.test/n' }],
    });
    expect(primaryWebhookEvent(entries[0]?.events)).toBe(WEBHOOK_EVENT_AGENT_DECISION);
    expect(eventsFromUiValue(WEBHOOK_EVENT_AGENT_DECISION)).toBeUndefined();
    expect(eventsFromUiValue('lead_captured')).toEqual(['lead_captured']);
  });
});
