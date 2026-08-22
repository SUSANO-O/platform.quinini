import { describe, expect, it } from 'vitest';
import { historyRetentionDays, maxWidgetHistoryTurns } from '@/lib/widget-memory-plan';

describe('widget-memory-plan', () => {
  it('maxWidgetHistoryTurns escala por plan', () => {
    // Escala de PLAN_WIDGET_HISTORY_TURNS bajó en algún punto (controlar
    // costo/calidad — ver comentario en la fuente); estos números siguen la
    // tabla actual, no la original con la que se escribió este test.
    expect(maxWidgetHistoryTurns('free')).toBe(6);
    expect(maxWidgetHistoryTurns('team')).toBe(12);
    expect(maxWidgetHistoryTurns('enterprise')).toBe(32);
    expect(maxWidgetHistoryTurns('unknown_plan')).toBe(6);
  });

  it('historyRetentionDays usa catálogo de planes', () => {
    expect(historyRetentionDays('starter')).toBeGreaterThan(0);
    expect(historyRetentionDays('bogus')).toBe(historyRetentionDays('free'));
  });
});
