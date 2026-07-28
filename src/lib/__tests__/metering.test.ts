import { describe, expect, it } from 'vitest';
import {
  detectWidgetMeteringChannel,
  getChannelBaseUnits,
  resolveMetering,
  DEFAULT_METERING_POLICIES,
  subscriptionPromoPolicy,
} from '@/lib/metering';

describe('detectWidgetMeteringChannel', () => {
  it('clasifica preview del dashboard', () => {
    expect(
      detectWidgetMeteringChannel({
        headers: new Headers({
          referer: 'http://localhost:3201/dashboard/widget-preview?id=abc',
        }),
      }),
    ).toBe('widget_preview');
  });

  it('clasifica producción embebida', () => {
    expect(
      detectWidgetMeteringChannel({
        headers: new Headers({ referer: 'https://cliente.com/tienda' }),
      }),
    ).toBe('widget_production');
  });
});

describe('resolveMetering', () => {
  it('preview = media unidad sin promos', () => {
    const d = resolveMetering({ channel: 'widget_preview' }, DEFAULT_METERING_POLICIES);
    expect(d.billableUnits).toBe(0.5);
    expect(d.limitMultiplier).toBe(1);
    expect(d.appliedRules.some((r) => r.startsWith('channel-base'))).toBe(true);
  });

  it('producción = 1 unidad', () => {
    const d = resolveMetering({ channel: 'widget_production' }, DEFAULT_METERING_POLICIES);
    expect(d.billableUnits).toBe(1);
  });

  it('aplica promo conv_weight desde subscription.features', () => {
    const d = resolveMetering(
      {
        channel: 'widget_production',
        subscriptionFeatures: ['promo:conv_weight:0.8'],
      },
      DEFAULT_METERING_POLICIES,
    );
    expect(d.billableUnits).toBe(0.8);
  });

  it('preview + promo se combinan (0.5 × 0.8)', () => {
    const d = resolveMetering(
      {
        channel: 'widget_preview',
        subscriptionFeatures: ['promo:conv_weight:0.8'],
      },
      DEFAULT_METERING_POLICIES,
    );
    expect(d.billableUnits).toBe(0.4);
  });

  it('promo limit_mult aumenta cupo efectivo', () => {
    const d = resolveMetering(
      {
        channel: 'widget_production',
        subscriptionFeatures: ['promo:limit_mult:1.2'],
      },
      DEFAULT_METERING_POLICIES,
    );
    expect(d.limitMultiplier).toBe(1.2);
    expect(d.billableUnits).toBe(1);
  });

  it('promo conv_weight:0 no descuenta cupo', () => {
    const d = resolveMetering(
      {
        channel: 'widget_production',
        subscriptionFeatures: ['promo:conv_weight:0'],
      },
      DEFAULT_METERING_POLICIES,
    );
    expect(d.billableUnits).toBe(0);
  });
});

describe('getChannelBaseUnits', () => {
  it('expone pesos por canal', () => {
    expect(getChannelBaseUnits('widget_preview')).toBe(0.5);
    expect(getChannelBaseUnits('widget_production')).toBe(1);
  });
});

describe('subscriptionPromoPolicy', () => {
  it('ignora features que no son promo de metering', () => {
    expect(
      subscriptionPromoPolicy.apply({
        channel: 'widget_production',
        subscriptionFeatures: ['scheduled_tasks', 'whatsapp'],
      }),
    ).toBeNull();
  });
});
