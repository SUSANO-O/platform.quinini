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

  // Antes el corte era seco al vencer el período: el cliente perdía el acceso
  // de un momento a otro y sin aviso. Ahora hay 7 días de cortesía con acceso
  // completo (ver GRACE_PERIOD_DAYS), durante los cuales se le avisa por correo.
  const DAY = 24 * 60 * 60;
  const expiredDaysAgo = (d: number) => Math.floor(NOW / 1000) - d * DAY;

  it('recién vencido — sigue con acceso, en período de cortesía', () => {
    const r = resolveSubscriptionAccess(
      { status: 'active', plan: 'solo', currentPeriodEnd: Math.floor(NOW / 1000) - 60 },
      NOW,
    );
    expect(r.hasAccess).toBe(true);
    expect(r.inGracePeriod).toBe(true);
    expect(r.graceEndsAt).toBeGreaterThan(Math.floor(NOW / 1000));
  });

  it('vencido hace 6 días — todavía dentro de la cortesía', () => {
    const r = resolveSubscriptionAccess(
      { status: 'active', plan: 'solo', currentPeriodEnd: expiredDaysAgo(6) },
      NOW,
    );
    expect(r.hasAccess).toBe(true);
    expect(r.inGracePeriod).toBe(true);
  });

  it('vencido hace 8 días — se agotó la cortesía, sin acceso', () => {
    const r = resolveSubscriptionAccess(
      { status: 'active', plan: 'solo', currentPeriodEnd: expiredDaysAgo(8) },
      NOW,
    );
    expect(r.isPremium).toBe(false);
    expect(r.hasAccess).toBe(false);
    expect(r.inGracePeriod).toBe(false);
    expect(r.graceEndsAt).toBe(0);
  });

  it('cancelación voluntaria vencida — sin cortesía', () => {
    const r = resolveSubscriptionAccess(
      { status: 'canceled', plan: 'solo', currentPeriodEnd: expiredDaysAgo(1) },
      NOW,
    );
    expect(r.hasAccess).toBe(false);
    expect(r.inGracePeriod).toBe(false);
  });

  it('past_due dentro de la cortesía — conserva acceso', () => {
    const r = resolveSubscriptionAccess(
      { status: 'past_due', plan: 'team', currentPeriodEnd: expiredDaysAgo(3) },
      NOW,
    );
    expect(r.hasAccess).toBe(true);
    expect(r.inGracePeriod).toBe(true);
  });
});
