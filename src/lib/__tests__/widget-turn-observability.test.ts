import { describe, expect, it } from 'vitest';
import {
  buildWidgetTurnObsFields,
  estimatePromptTokensFromChars,
  evaluateSseStatusHonesty,
} from '@/lib/widget-turn-observability';

describe('estimatePromptTokensFromChars', () => {
  it('ceil chars/4', () => {
    expect(estimatePromptTokensFromChars(0)).toBe(0);
    expect(estimatePromptTokensFromChars(4)).toBe(1);
    expect(estimatePromptTokensFromChars(5)).toBe(2);
    expect(estimatePromptTokensFromChars(4500)).toBe(1125);
  });
});

describe('evaluateSseStatusHonesty', () => {
  it('prepare solo es honesto', () => {
    expect(evaluateSseStatusHonesty(['prepare'])).toEqual({
      statusHonest: true,
      lyingReason: null,
    });
  });

  it('prepare + triage multiagente es honesto', () => {
    expect(evaluateSseStatusHonesty(['prepare', 'triage']).statusHonest).toBe(true);
  });

  it('rag tras prepare es mentiroso', () => {
    const r = evaluateSseStatusHonesty(['prepare', 'rag']);
    expect(r.statusHonest).toBe(false);
    expect(r.lyingReason).toMatch(/anticipatorio/);
  });

  it('sin fases: no marca mentira (aún no arrancó SSE)', () => {
    expect(evaluateSseStatusHonesty([])).toEqual({
      statusHonest: true,
      lyingReason: null,
    });
  });
});

describe('buildWidgetTurnObsFields', () => {
  it('arma resumen con path, tools y tokens', () => {
    const obs = buildWidgetTurnObsFields({
      path: 'stream-direct-mcp',
      ssePhases: ['prepare', 'hub', 'model'],
      toolsUsed: ['sheet_read', 'sheet_read'],
      promptChars: 4000,
      inputTokens: 900,
      replyLen: 120,
      totalMs: 2300,
    });
    expect(obs.event).toBe('widget_turn_obs');
    expect(obs.path).toBe('stream-direct-mcp');
    expect(obs.toolCount).toBe(1);
    expect(obs.toolsUsed).toEqual(['sheet_read']);
    expect(obs.promptTokensEst).toBe(1000);
    expect(obs.statusHonest).toBe(true);
    expect(obs.inputTokens).toBe(900);
  });

  it('marca statusHonest false si boot anticipatorio', () => {
    const obs = buildWidgetTurnObsFields({
      path: 'stream-hub',
      ssePhases: ['prepare', 'model'],
    });
    expect(obs.statusHonest).toBe(false);
    expect(obs.lyingReason).toBeTruthy();
  });
});
