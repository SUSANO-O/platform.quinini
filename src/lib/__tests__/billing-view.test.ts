import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  statusLabel,
  hasPaidPlan,
  invoiceApiBase,
} from '@/lib/billing-view';

describe('formatMoney', () => {
  // Los importes llegan en céntimos: 1234 son 12,34 — no 1.234.
  it('convierte céntimos a unidades', () => {
    expect(formatMoney(1234, 'usd')).toMatch(/12[.,]34/);
    expect(formatMoney(700, 'usd')).toMatch(/7[.,]00/);
  });

  it('el cero se muestra, no se omite', () => {
    expect(formatMoney(0, 'usd')).toMatch(/0[.,]00/);
  });

  // Un reembolso puede venir en negativo y tiene que verse como tal.
  it('mantiene el signo de un reembolso', () => {
    expect(formatMoney(-1500, 'usd')).toMatch(/-|−/);
  });

  it('no pierde céntimos por redondeo', () => {
    expect(formatMoney(1999, 'usd')).toMatch(/19[.,]99/);
    expect(formatMoney(1, 'usd')).toMatch(/0[.,]01/);
  });

  it('acepta la moneda en minúsculas', () => {
    expect(formatMoney(1000, 'eur')).toBe(formatMoney(1000, 'EUR'));
  });

  // Una moneda inválida no debe dejar la fila en blanco ni reventar.
  it('una moneda desconocida cae a un formato simple', () => {
    const r = formatMoney(1234, 'xyz123');
    expect(r).toContain('12.34');
    expect(r.toLowerCase()).toContain('xyz123');
  });

  it('sin moneda tampoco rompe', () => {
    expect(formatMoney(1234, '')).toContain('12.34');
  });
});

describe('statusLabel', () => {
  it('traduce los estados conocidos', () => {
    expect(statusLabel('paid').label).toBe('Pagada');
    expect(statusLabel('completed').label).toBe('Completada');
    expect(statusLabel('open').label).toBe('Pendiente');
    expect(statusLabel('void').label).toBe('Anulada');
    expect(statusLabel('refunded').label).toBe('Reembolsada');
  });

  it('cada estado trae su papel de color', () => {
    expect(statusLabel('paid').tone).toBe('success');
    expect(statusLabel('completed').tone).toBe('success');
    expect(statusLabel('open').tone).toBe('warning');
    expect(statusLabel('void').tone).toBe('neutral');
    expect(statusLabel('refunded').tone).toBe('neutral');
  });

  it('un estado nuevo se muestra tal cual, en neutro', () => {
    expect(statusLabel('disputed')).toEqual({ label: 'disputed', tone: 'neutral' });
  });

  it('sin estado, un guion', () => {
    expect(statusLabel(null)).toEqual({ label: '—', tone: 'neutral' });
    expect(statusLabel('')).toEqual({ label: '—', tone: 'neutral' });
  });
});

describe('hasPaidPlan', () => {
  it('los estados de un plan pagado', () => {
    for (const status of ['active', 'trialing', 'past_due', 'canceled']) {
      expect(hasPaidPlan({ status, plan: 'growth' })).toBe(true);
    }
  });

  // El plan gratuito no tiene portal de pagos que abrir.
  it('el plan free nunca cuenta, tenga el estado que tenga', () => {
    expect(hasPaidPlan({ status: 'active', plan: 'free' })).toBe(false);
  });

  it('un estado ajeno a la lista no cuenta', () => {
    expect(hasPaidPlan({ status: 'incomplete', plan: 'growth' })).toBe(false);
  });

  it('sin suscripción, no', () => {
    expect(hasPaidPlan(null)).toBe(false);
    expect(hasPaidPlan(undefined)).toBe(false);
  });

  it('sin estado o sin plan, no', () => {
    expect(hasPaidPlan({ status: '', plan: 'growth' })).toBe(false);
    expect(hasPaidPlan({ status: 'active', plan: '' })).toBe(false);
  });
});

describe('invoiceApiBase', () => {
  it('sin admin, la ruta propia', () => {
    expect(invoiceApiBase()).toBe('/api/billing');
    expect(invoiceApiBase(undefined)).toBe('/api/billing');
  });

  it('con admin, la ruta del usuario', () => {
    expect(invoiceApiBase('u123')).toBe('/api/admin/billing/u123');
  });

  // Un id vacío no debe producir "/api/admin/billing/" y listar de más.
  it('un id vacío cae a la ruta propia', () => {
    expect(invoiceApiBase('')).toBe('/api/billing');
    expect(invoiceApiBase('   ')).toBe('/api/billing');
  });

  it('escapa el id en la ruta', () => {
    expect(invoiceApiBase('a/b')).toBe('/api/admin/billing/a%2Fb');
  });
});
