import { describe, expect, it } from 'vitest';
import { resolveSubscriptionAccess } from '@/lib/subscription';

const NOW = new Date('2026-06-09T12:00:00Z').getTime();

describe('resolveSubscriptionAccess', () => {
  it('plan free sin pago — sin acceso', () => {
    const r = resolveSubscriptionAccess(
      {
        status: 'incomplete',
        plan: 'free',
        currentPeriodEnd: 0,
      },
      NOW,
    );
    expect(r.isTrialActive).toBe(false);
    expect(r.isPremium).toBe(false);
    expect(r.hasAccess).toBe(false);
    expect(r.trialDaysRemaining).toBe(0);
  });

  it('trialing con LemonSqueezy — acceso de pago', () => {
    const r = resolveSubscriptionAccess(
      {
        status: 'trialing',
        plan: 'solo',
        currentPeriodEnd: 0,
        lsSubscriptionId: 'ls_sub_123',
      },
      NOW,
    );
    expect(r.isTrialActive).toBe(false);
    expect(r.isPremium).toBe(true);
    expect(r.hasAccess).toBe(true);
  });

  it('trialing sin cobrador — sin acceso', () => {
    const r = resolveSubscriptionAccess(
      {
        status: 'trialing',
        plan: 'solo',
        currentPeriodEnd: 0,
        trialEndsAt: new Date('2026-06-16T12:00:00Z'),
        lsSubscriptionId: null,
      },
      NOW,
    );
    expect(r.isPremium).toBe(false);
    expect(r.hasAccess).toBe(false);
  });

  it('plan solo activo sin Lemon — premium manual', () => {
    const r = resolveSubscriptionAccess(
      {
        status: 'active',
        plan: 'solo',
        currentPeriodEnd: 0,
        lsSubscriptionId: null,
      },
      NOW,
    );
    expect(r.isPremium).toBe(true);
    expect(r.hasAccess).toBe(true);
    expect(r.hasStripeSubscription).toBe(false);
  });

  it('periodo vencido — sin acceso de pago', () => {
    const r = resolveSubscriptionAccess(
      {
        status: 'active',
        plan: 'solo',
        currentPeriodEnd: Math.floor(NOW / 1000) - 60,
      },
      NOW,
    );
    expect(r.isPremium).toBe(false);
    expect(r.hasAccess).toBe(false);
  });
});
