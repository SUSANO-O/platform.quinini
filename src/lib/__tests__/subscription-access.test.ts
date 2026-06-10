import { describe, expect, it } from 'vitest';
import { resolveSubscriptionAccess } from '@/lib/subscription';

const NOW = new Date('2026-06-09T12:00:00Z').getTime();

describe('resolveSubscriptionAccess', () => {
  it('trial manual con plan solo — acceso trial, no premium', () => {
    const r = resolveSubscriptionAccess(
      {
        status: 'trialing',
        plan: 'solo',
        currentPeriodEnd: 0,
        trialEndsAt: new Date('2026-06-16T12:00:00Z'),
        lsSubscriptionId: 'sub_old_business',
      },
      NOW,
    );
    expect(r.isTrialActive).toBe(true);
    expect(r.isPremium).toBe(false);
    expect(r.hasAccess).toBe(true);
    expect(r.trialDaysRemaining).toBe(7);
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
