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
  formatConversationAnalyticsFeature,
  effectiveProductPlan,
  AGENT_WEBHOOK_MIN_PLAN,
  OUTBOUND_SAAS_WEBHOOK_MIN_PLAN,
  ESCALATION_SLACK_MIN_PLAN,
  API_ACCESS_MIN_PLAN,
  ESCALATION_TICKET_MIN_PLAN,
  CUSTOM_INTEGRATION_MIN_PLAN,
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
    expect(planHasApiAccessFeature('team')).toBe(true);
    expect(planHasEscalationTicketFeature('business')).toBe(true);
    expect(planHasCustomIntegrationFeature('business')).toBe(true);
    expect(formatConversationAnalyticsFeature('plus')).toBe('Básico');
    expect(formatConversationAnalyticsFeature('business')).toBe('Completo');
  });

  it('sellable paid plans exclude legacy tiers', () => {
    expect(PAID_PLAN_IDS).toEqual(['solo', 'team', 'plus', 'business']);
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
    expect(limits.agents).toBe(3);
  });

  it('webhook tool minPlan matches Team gate', () => {
    expect(TOOL_MAP.webhook?.minPlan).toBe('team');
  });
});

describe('pricing comparison rows', () => {
  it('includes webhook and platform feature columns for sellable plans', () => {
    const rows = buildPlanComparisonRows();
    expect(rows.map((r) => r.id)).toEqual(['free', 'solo', 'team', 'plus', 'business']);
    const plus = rows.find((r) => r.id === 'plus');
    const business = rows.find((r) => r.id === 'business');
    expect(plus?.conversationAnalytics).toBe('Básico');
    expect(plus?.outboundWebhook).toBe('Incluido');
    expect(rows.find((r) => r.id === 'team')?.apiAccess).toBe('Próximamente');
    expect(business?.escalationTickets).toBe('Incluido');
    expect(business?.customIntegration).toBe('Incluido');
    expect(business?.conversationAnalytics).toBe('Completo');
  });
});
