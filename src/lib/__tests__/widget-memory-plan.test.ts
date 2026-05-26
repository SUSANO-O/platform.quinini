import { describe, expect, it } from 'vitest';
import { historyRetentionDays, maxWidgetHistoryTurns } from '@/lib/widget-memory-plan';

describe('widget-memory-plan', () => {
  it('maxWidgetHistoryTurns escala por plan', () => {
    expect(maxWidgetHistoryTurns('free')).toBe(20);
    expect(maxWidgetHistoryTurns('team')).toBe(40);
    expect(maxWidgetHistoryTurns('enterprise')).toBe(60);
    expect(maxWidgetHistoryTurns('unknown_plan')).toBe(20);
  });

  it('historyRetentionDays usa catálogo de planes', () => {
    expect(historyRetentionDays('starter')).toBeGreaterThan(0);
    expect(historyRetentionDays('bogus')).toBe(historyRetentionDays('free'));
  });
});
