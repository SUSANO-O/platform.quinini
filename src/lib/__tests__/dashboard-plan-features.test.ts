import { describe, expect, it } from 'vitest';
import { buildDashboardPlanFeatures, countEnabledFeatures } from '../dashboard-plan-features';

describe('buildDashboardPlanFeatures', () => {
  it('Business sin api_access: API bloqueada, resto avanzado activo', () => {
    const features = buildDashboardPlanFeatures('business', 'active', []);
    const api = features.find((f) => f.key === 'api_rest');
    const whatsapp = features.find((f) => f.key === 'whatsapp');
    const rag = features.find((f) => f.key === 'rag');

    expect(api?.enabled).toBe(false);
    expect(api?.unlockLabel).toContain('add-on');
    expect(whatsapp?.enabled).toBe(true);
    expect(rag?.enabled).toBe(true);
    expect(countEnabledFeatures(features)).toBeGreaterThan(10);
  });

  it('Business con override api_access activa API', () => {
    const features = buildDashboardPlanFeatures('business', 'active', ['api_access']);
    expect(features.find((f) => f.key === 'api_rest')?.enabled).toBe(true);
    expect(features.find((f) => f.key === 'api_rest')?.viaOverride).toBe(true);
  });

  it('Suscripción inactiva usa límites free (sin RAG)', () => {
    const features = buildDashboardPlanFeatures('team', 'canceled', []);
    expect(features.find((f) => f.key === 'rag')?.enabled).toBe(false);
  });

  it('api_develop: solo features API-centric', () => {
    const features = buildDashboardPlanFeatures('api_develop', 'active', []);
    expect(features.some((f) => f.key === 'widget_embed')).toBe(false);
    expect(features.find((f) => f.key === 'api_rest')?.enabled).toBe(true);
  });
});
