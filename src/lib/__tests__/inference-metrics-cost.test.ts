import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Las métricas de inferencia guardaban costUsd = null en todos los caminos y mezclaban la sonda
 * horaria con el tráfico real. Ahora el coste se estima con la tabla de precios y la sonda se marca.
 */
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock('@/lib/db/models', () => ({ InferenceMetric: { create: mockCreate } }));

import { isProbeSessionId, logInferenceMetric, metricCostUsd } from '@/lib/inference-metrics';

afterEach(() => vi.clearAllMocks());

describe('metricCostUsd', () => {
  it('estima con la tabla de precios del modelo (gemini-2.5-flash: 0,30 / 2,50 USD por 1M)', () => {
    expect(metricCostUsd({ model: 'vx/gemini-2.5-flash', inputTokens: 10_000, outputTokens: 1_000 })).toBe(0.0055);
  });

  it('respeta un coste ya calculado', () => {
    expect(metricCostUsd({ costUsd: 0.12, model: 'gemini-2.5-flash', inputTokens: 1, outputTokens: 1 })).toBe(0.12);
  });

  it('sin modelo o sin tokens de salida no inventa un coste', () => {
    expect(metricCostUsd({ model: '', inputTokens: 100, outputTokens: 100 })).toBeNull();
    expect(metricCostUsd({ model: 'gemini-2.5-flash', inputTokens: 100, outputTokens: null })).toBeNull();
  });

  it('sin tokens de entrada cuenta solo la salida', () => {
    expect(metricCostUsd({ model: 'gemini-2.5-flash', inputTokens: null, outputTokens: 1_000_000 })).toBe(2.5);
  });
});

describe('isProbeSessionId', () => {
  it('reconoce las sesiones de la sonda horaria', () => {
    expect(isProbeSessionId('hourly_1792533600126')).toBe(true);
    expect(isProbeSessionId('sess_abc')).toBe(false);
    expect(isProbeSessionId(null)).toBe(false);
  });
});

describe('logInferenceMetric', () => {
  it('guarda el coste estimado y la marca de sonda', async () => {
    logInferenceMetric({
      userId: 'u1',
      agentId: 'a1',
      sessionId: 'hourly_1',
      model: 'gemini-2.5-flash',
      inputTokens: 10_000,
      outputTokens: 1_000,
      latencyMs: 1200,
      path: 'direct-mcp',
    });
    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    const doc = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(doc.costUsd).toBe(0.0055);
    expect(doc.isProbe).toBe(true);
    expect(doc.latencyMs).toBe(1200);
  });

  it('un visitante real no se marca como sonda', async () => {
    logInferenceMetric({ userId: 'u1', agentId: 'a1', sessionId: 'sess_real', path: 'stream-hub' });
    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect((mockCreate.mock.calls[0][0] as Record<string, unknown>).isProbe).toBe(false);
  });
});
