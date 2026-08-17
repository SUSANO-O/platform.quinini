import { describe, expect, it } from 'vitest';
import { analyzeWidgetLatencyInsights } from '@/lib/widget-latency-insights';

/** Tráfico tipo 16 ago: martillo + triaje LLM, MCP e inferencia igual de lentos. */
const SATURATED_INPUT = {
  totalRequests: 4622,
  avgTotalMs: 27000,
  byPath: [
    { path: 'non-stream-direct-mcp', requests: 2069, avgTotalMs: 27800 },
    { path: 'non-stream-infer-direct', requests: 1861, avgTotalMs: 29600 },
    { path: 'stream-direct-mcp', requests: 199, avgTotalMs: 16000 },
    { path: 'non-stream-error', requests: 181, avgTotalMs: 14700 },
    { path: 'non-stream-hub', requests: 165, avgTotalMs: 28600 },
    { path: 'stream-infer-direct', requests: 77, avgTotalMs: 9300 },
    { path: 'stream-error', requests: 41, avgTotalMs: 8000 },
    { path: 'stream-hub', requests: 29, avgTotalMs: 11600 },
  ],
  byPhase: [
    { phase: 'multi_triage', avgMs: 11500, samples: 4536 },
    { phase: 'infer_direct', avgMs: 10500, samples: 2354 },
    { phase: 'direct_mcp', avgMs: 5600, samples: 4620 },
    { phase: 'hub', avgMs: 5300, samples: 407 },
    { phase: 'auth', avgMs: 750, samples: 693 },
    { phase: 'reveal', avgMs: 335, samples: 305 },
  ],
};

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

  it('recomienda no apilar 2–4 LLM cuando pipeline domina', () => {
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
    expect(insights.recommendations.some((r) => r.category === 'pipeline_parallel')).toBe(true);
    expect(insights.recommendations.some((r) => /desactiva multiAgentEnabled/i.test(r.action))).toBe(false);
  });

  it('no culpa a HubSpot/webhooks cuando MCP e inferencia tardan igual', () => {
    const insights = analyzeWidgetLatencyInsights(SATURATED_INPUT);

    const titles = insights.recommendations.map((r) => r.title).join(' | ');
    const actions = insights.recommendations.map((r) => r.action).join(' ');

    expect(insights.pathGroups.find((g) => g.key === 'direct_mcp')?.label).not.toMatch(/webhook/i);
    expect(insights.decisionSummary).not.toMatch(/webhooks\/tools/i);
    expect(titles).not.toMatch(/Hub\/MCP es el cuello/i);
    expect(actions).not.toMatch(/enabledMcpToolIds/i);
    expect(actions).not.toMatch(/Desactiva multiAgentEnabled/i);

    expect(insights.recommendations.some((r) => r.category === 'infer_direct' && r.priority === 'alta')).toBe(true);
    expect(insights.recommendations.some((r) => r.category === 'multi_agent')).toBe(true);
    expect(insights.nonStreamSharePct).toBeGreaterThan(70);
    expect(insights.decisionSummary).toMatch(/modelo/i);
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
