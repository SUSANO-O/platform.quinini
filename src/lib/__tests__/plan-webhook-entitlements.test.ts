import { describe, it, expect } from 'vitest';
import {
  canUseAgentWebhookTool,
  canUseOutboundSaasWebhook,
  planHasAgentWebhookFeature,
  planHasOutboundWebhookFeature,
  effectiveProductPlan,
  AGENT_WEBHOOK_MIN_PLAN,
  OUTBOUND_SAAS_WEBHOOK_MIN_PLAN,
  PLAN_FEATURE_BULLETS,
} from '../plan-catalog';
import { buildPlanComparisonRows } from '../plan-economics';
import { getAgentLimits, TOOL_MAP } from '../agent-plans';

describe('webhook entitlements (plan-catalog)', () => {
  it('defines expected minimum plans', () => {
    expect(AGENT_WEBHOOK_MIN_PLAN).toBe('solo');
    expect(OUTBOUND_SAAS_WEBHOOK_MIN_PLAN).toBe('starter');
  });

  it('agent webhook: Solo+ only', () => {
    expect(canUseAgentWebhookTool('free')).toBe(false);
    expect(canUseAgentWebhookTool('solo')).toBe(true);
    expect(canUseAgentWebhookTool('basic')).toBe(true);
    expect(canUseAgentWebhookTool('plus')).toBe(true);
    expect(canUseAgentWebhookTool('starter')).toBe(true);
  });

  it('outbound webhook: Starter+ with active subscription', () => {
    expect(canUseOutboundSaasWebhook('free', 'free')).toBe(false);
    expect(canUseOutboundSaasWebhook('solo', 'active')).toBe(false);
    expect(canUseOutboundSaasWebhook('plus', 'active')).toBe(false);
    expect(canUseOutboundSaasWebhook('starter', 'active')).toBe(true);
    expect(canUseOutboundSaasWebhook('starter', 'trialing')).toBe(true);
    expect(canUseOutboundSaasWebhook('starter', 'past_due')).toBe(true);
    expect(canUseOutboundSaasWebhook('growth', 'active')).toBe(true);
  });

  it('outbound webhook blocked when subscription inactive', () => {
    expect(canUseOutboundSaasWebhook('starter', 'canceled')).toBe(false);
    expect(canUseOutboundSaasWebhook('growth', 'free')).toBe(false);
    expect(effectiveProductPlan('starter', 'canceled')).toBe('free');
  });

  it('feature flags for pricing table', () => {
    expect(planHasAgentWebhookFeature('free')).toBe(false);
    expect(planHasAgentWebhookFeature('solo')).toBe(true);
    expect(planHasOutboundWebhookFeature('plus')).toBe(false);
    expect(planHasOutboundWebhookFeature('starter')).toBe(true);
  });

  it('plan bullets mention webhooks on paid tiers', () => {
    expect(PLAN_FEATURE_BULLETS.solo.some((b) => /webhook/i.test(b))).toBe(true);
    expect(PLAN_FEATURE_BULLETS.basic.some((b) => /webhook/i.test(b))).toBe(true);
    expect(PLAN_FEATURE_BULLETS.starter.some((b) => /saliente|HMAC/i.test(b))).toBe(true);
  });
});

describe('agent tool limits (agent-plans)', () => {
  it('free plan excludes webhook tool', () => {
    const limits = getAgentLimits('free');
    expect(limits.availableToolIds).not.toContain('webhook');
    expect(limits.availableToolIds).toContain('web-search');
  });

  it('solo plan includes webhook tool', () => {
    const limits = getAgentLimits('solo');
    expect(limits.availableToolIds).toContain('webhook');
  });

  it('webhook tool minPlan matches Solo gate', () => {
    expect(TOOL_MAP.webhook?.minPlan).toBe('solo');
  });
});

describe('pricing comparison rows', () => {
  it('includes webhook columns for all plans', () => {
    const rows = buildPlanComparisonRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveProperty('agentWebhook');
      expect(row).toHaveProperty('outboundWebhook');
    }
    const free = rows.find((r) => r.id === 'free');
    const solo = rows.find((r) => r.id === 'solo');
    const starter = rows.find((r) => r.id === 'starter');
    expect(free?.agentWebhook).toBe('—');
    expect(free?.outboundWebhook).toBe('—');
    expect(solo?.agentWebhook).toBe('Incluido');
    expect(solo?.outboundWebhook).toBe('—');
    expect(starter?.outboundWebhook).toBe('Incluido');
  });
});
