import { describe, it, expect } from 'vitest';
import {
  canUseAgentWebhookTool,
  canUseOutboundSaasWebhook,
  canUseEscalationSlack,
  planHasAgentWebhookFeature,
  planHasOutboundWebhookFeature,
  planHasEscalationSlackFeature,
  planHasApiAccessFeature,
  planHasEscalationTicketFeature,
  planHasCustomIntegrationFeature,
  planHasWhatsAppFeature,
  canUseWhatsApp,
  formatConversationAnalyticsFeature,
  formatApiAccessFeature,
  effectiveProductPlan,
  AGENT_WEBHOOK_MIN_PLAN,
  OUTBOUND_SAAS_WEBHOOK_MIN_PLAN,
  ESCALATION_SLACK_MIN_PLAN,
  API_ACCESS_MIN_PLAN,
  ESCALATION_TICKET_MIN_PLAN,
  CUSTOM_INTEGRATION_MIN_PLAN,
  WHATSAPP_MIN_PLAN,
  WHATSAPP_FEATURE,
  OUTBOUND_WEBHOOK_FEATURE,
  ESCALATION_SLACK_FEATURE,
  ESCALATION_TICKET_FEATURE,
  API_ACCESS_FEATURE,
  VALID_FEATURE_OVERRIDES,
  canUseEscalationTickets,
  canUseApiAccess,
  PLAN_FEATURE_BULLETS,
  LEGACY_PLAN_FEATURE_BULLETS,
  PAID_PLAN_IDS,
  isLegacyPlan,
} from '../plan-catalog';
import { buildPlanComparisonRows } from '../plan-economics';
import { getAgentLimits, TOOL_MAP } from '../agent-plans';

describe('webhook entitlements (plan-catalog)', () => {
  it('defines expected minimum plans', () => {
    expect(AGENT_WEBHOOK_MIN_PLAN).toBe('team');
    expect(OUTBOUND_SAAS_WEBHOOK_MIN_PLAN).toBe('plus');
    expect(ESCALATION_SLACK_MIN_PLAN).toBe('team');
    expect(API_ACCESS_MIN_PLAN).toBe('team');
    expect(ESCALATION_TICKET_MIN_PLAN).toBe('business');
    expect(CUSTOM_INTEGRATION_MIN_PLAN).toBe('business');
    expect(WHATSAPP_MIN_PLAN).toBe('business');
  });

  it('api access: solo Team+ panel no incluye API; requiere api_develop o add-on', () => {
    expect(canUseApiAccess('team', 'active')).toBe(false);
    expect(canUseApiAccess('plus', 'active')).toBe(false);
    expect(canUseApiAccess('business', 'active')).toBe(false);
    expect(canUseApiAccess('team', 'active', [API_ACCESS_FEATURE])).toBe(true);
    expect(canUseApiAccess('solo', 'active')).toBe(false);
  });

  it('whatsapp: Business+ only with active subscription', () => {
    expect(canUseWhatsApp('free', 'free')).toBe(false);
    expect(canUseWhatsApp('team', 'active')).toBe(false);
    expect(canUseWhatsApp('plus', 'active')).toBe(false);
    expect(canUseWhatsApp('business', 'active')).toBe(true);
    expect(canUseWhatsApp('business', 'trialing')).toBe(true);
    expect(canUseWhatsApp('enterprise', 'active')).toBe(true);
    // Business sin suscripción vigente cae a free → bloqueado
    expect(canUseWhatsApp('business', 'canceled')).toBe(false);
    expect(planHasWhatsAppFeature('plus')).toBe(false);
    expect(planHasWhatsAppFeature('business')).toBe(true);
  });

  it('whatsapp: admin override concede acceso a planes inferiores', () => {
    expect(canUseWhatsApp('team', 'active', [WHATSAPP_FEATURE])).toBe(true);
    expect(canUseWhatsApp('free', 'active', [WHATSAPP_FEATURE])).toBe(true);
    // override no afecta a otras features
    expect(canUseWhatsApp('team', 'active', ['scheduled_tasks'])).toBe(false);
    expect(canUseWhatsApp('team', 'active', [])).toBe(false);
  });

  it('override por feature concede acceso a planes inferiores en todas las features', () => {
    expect(canUseOutboundSaasWebhook('free', 'active', [OUTBOUND_WEBHOOK_FEATURE])).toBe(true);
    expect(canUseEscalationSlack('free', 'active', [ESCALATION_SLACK_FEATURE])).toBe(true);
    expect(canUseEscalationTickets('free', 'active', [ESCALATION_TICKET_FEATURE])).toBe(true);
    expect(canUseApiAccess('free', 'active', [API_ACCESS_FEATURE])).toBe(true);
    // sin override, plan inferior sigue bloqueado
    expect(canUseEscalationTickets('plus', 'active')).toBe(false);
    expect(canUseApiAccess('solo', 'active')).toBe(false);
  });

  it('VALID_FEATURE_OVERRIDES incluye las 7 claves de override', () => {
    expect(VALID_FEATURE_OVERRIDES).toEqual(
      expect.arrayContaining([
        'scheduled_tasks', 'whatsapp', 'outbound_webhook',
        'escalation_slack', 'escalation_tickets', 'api_access', 'custom_integration',
      ]),
    );
    expect(VALID_FEATURE_OVERRIDES).toHaveLength(7);
  });

  it('api_develop plan: REST sí, webhooks de producto no', () => {
    expect(canUseApiAccess('api_develop', 'active')).toBe(true);
    expect(canUseAgentWebhookTool('api_develop')).toBe(false);
    expect(planHasApiAccessFeature('api_develop')).toBe(true);
    expect(formatApiAccessFeature('api_develop')).toBe('Incluido');
    expect(formatApiAccessFeature('team')).toContain('Add-on');
  });

  it('agent webhook: Team+ only (legacy Basic still entitled)', () => {
    expect(canUseAgentWebhookTool('free')).toBe(false);
    expect(canUseAgentWebhookTool('solo')).toBe(false);
    expect(canUseAgentWebhookTool('basic')).toBe(true);
    expect(canUseAgentWebhookTool('team')).toBe(true);
    expect(canUseAgentWebhookTool('plus')).toBe(true);
    expect(canUseAgentWebhookTool('starter')).toBe(true);
  });

  it('outbound webhook: Plus+ with active subscription', () => {
    expect(canUseOutboundSaasWebhook('free', 'free')).toBe(false);
    expect(canUseOutboundSaasWebhook('solo', 'active')).toBe(false);
    expect(canUseOutboundSaasWebhook('team', 'active')).toBe(false);
    expect(canUseOutboundSaasWebhook('plus', 'active')).toBe(true);
    expect(canUseOutboundSaasWebhook('plus', 'trialing')).toBe(true);
    expect(canUseOutboundSaasWebhook('starter', 'active')).toBe(true);
    expect(canUseOutboundSaasWebhook('growth', 'active')).toBe(true);
  });

  it('outbound webhook blocked when subscription inactive', () => {
    expect(canUseOutboundSaasWebhook('plus', 'canceled')).toBe(false);
    expect(canUseOutboundSaasWebhook('starter', 'canceled')).toBe(false);
    expect(effectiveProductPlan('plus', 'canceled')).toBe('free');
  });

  it('escalation Slack: Team+ with active subscription', () => {
    expect(canUseEscalationSlack('free', 'free')).toBe(false);
    expect(canUseEscalationSlack('solo', 'active')).toBe(false);
    expect(canUseEscalationSlack('basic', 'active')).toBe(false);
    expect(canUseEscalationSlack('team', 'active')).toBe(true);
    expect(canUseEscalationSlack('plus', 'active')).toBe(true);
    expect(canUseEscalationSlack('starter', 'active')).toBe(true);
  });

  it('feature flags for pricing table', () => {
    expect(planHasAgentWebhookFeature('free')).toBe(false);
    expect(planHasOutboundWebhookFeature('team')).toBe(false);
    expect(planHasOutboundWebhookFeature('plus')).toBe(true);
    expect(planHasEscalationSlackFeature('team')).toBe(true);
    expect(planHasApiAccessFeature('team')).toBe(false);
    expect(planHasApiAccessFeature('api_develop')).toBe(true);
    expect(formatApiAccessFeature('team')).toContain('Add-on');
    expect(planHasEscalationTicketFeature('business')).toBe(true);
    expect(planHasCustomIntegrationFeature('business')).toBe(true);
    expect(formatConversationAnalyticsFeature('plus')).toBe('Básico');
    expect(formatConversationAnalyticsFeature('business')).toBe('Completo');
  });

  it('sellable paid plans exclude legacy tiers', () => {
    expect(PAID_PLAN_IDS).toEqual(['solo', 'api_develop', 'team', 'plus', 'business']);
    // Legacy plans fully removed — isLegacyPlan always returns false
    expect(isLegacyPlan('basic')).toBe(false);
    expect(isLegacyPlan('plus')).toBe(false);
  });

  it('plan bullets mention webhooks on paid tiers', () => {
    expect(PLAN_FEATURE_BULLETS.solo.some((b) => /webhook/i.test(b))).toBe(false);
    expect(PLAN_FEATURE_BULLETS.team.some((b) => /webhook/i.test(b))).toBe(true);
    expect(PLAN_FEATURE_BULLETS.plus.some((b) => /saliente|HMAC/i.test(b))).toBe(true);
    // LEGACY_PLAN_FEATURE_BULLETS is now empty
    expect(Object.keys(LEGACY_PLAN_FEATURE_BULLETS)).toHaveLength(0);
  });
});

describe('agent tool limits (agent-plans)', () => {
  it('free plan excludes webhook tool', () => {
    const limits = getAgentLimits('free');
    expect(limits.availableToolIds).not.toContain('webhook');
    expect(limits.availableToolIds).toContain('web-search');
  });

  it('solo plan has no agent tools (chat only)', () => {
    const limits = getAgentLimits('solo');
    expect(limits.availableToolIds).toEqual([]);
    expect(limits.toolsPerAgent).toBe(0);
    expect(limits.agents).toBe(4);
  });

  it('webhook tool minPlan matches Team gate', () => {
    expect(TOOL_MAP.webhook?.minPlan).toBe('team');
  });
});

describe('pricing comparison rows', () => {
  it('includes webhook and platform feature columns for sellable plans', () => {
    const rows = buildPlanComparisonRows();
    expect(rows.map((r) => r.id)).toEqual(['solo', 'team', 'plus', 'business', 'api_develop']);
    const plus = rows.find((r) => r.id === 'plus');
    const business = rows.find((r) => r.id === 'business');
    expect(plus?.conversationAnalytics).toBe('Básico');
    expect(plus?.outboundWebhook).toBe('Incluido');
    expect(rows.find((r) => r.id === 'team')?.apiAccess).toContain('Add-on');
    expect(business?.escalationTickets).toBe('Incluido');
    expect(business?.customIntegration).toBe('Incluido');
    expect(business?.conversationAnalytics).toBe('Completo');
  });
});
