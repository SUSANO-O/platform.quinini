import { describe, expect, it } from 'vitest';
import { analyzeWidgetLatencyInsights } from '@/lib/widget-latency-insights';

describe('widget-latency-insights', () => {
  it('detecta hub como cuello dominante por path', () => {
    const insights = analyzeWidgetLatencyInsights({
      totalRequests: 100,
      avgTotalMs: 18000,
      byPath: [
        { path: 'stream-hub', requests: 70, avgTotalMs: 22000 },
        { path: 'stream-infer-direct', requests: 20, avgTotalMs: 3000 },
        { path: 'non-stream-direct-mcp', requests: 10, avgTotalMs: 35000 },
      ],
      byPhase: [
        { phase: 'hub', avgMs: 18000, samples: 80 },
        { phase: 'auth', avgMs: 200, samples: 100 },
        { phase: 'reveal', avgMs: 1200, samples: 70 },
      ],
    });

    expect(insights.hasEnoughData).toBe(true);
    expect(insights.dominantPathGroup).toBe('hub');
    expect(insights.pathGroups[0].key).toBe('hub');
    expect(insights.recommendations.some((r) => r.category === 'hub')).toBe(true);
  });

  it('recomienda desactivar multi-agente cuando pipeline domina', () => {
    const insights = analyzeWidgetLatencyInsights({
      totalRequests: 50,
      avgTotalMs: 25000,
      byPath: [
        { path: 'stream-pipeline', requests: 40, avgTotalMs: 28000 },
        { path: 'stream-hub', requests: 10, avgTotalMs: 12000 },
      ],
      byPhase: [
        { phase: 'multi_pipeline', avgMs: 20000, samples: 40 },
        { phase: 'reveal', avgMs: 900, samples: 40 },
      ],
    });

    expect(insights.dominantPathGroup).toBe('pipeline_parallel');
    expect(insights.recommendations.some((r) => r.title.includes('Multi-agente'))).toBe(true);
  });

  it('sin datos suficientes indica generar tráfico', () => {
    const insights = analyzeWidgetLatencyInsights({
      totalRequests: 2,
      avgTotalMs: 5000,
      byPath: [],
      byPhase: [],
    });

    expect(insights.hasEnoughData).toBe(false);
    expect(insights.recommendations[0].action).toContain('tráfico');
  });
});
