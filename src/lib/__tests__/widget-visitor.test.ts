import { describe, expect, it } from 'vitest';
import {
  createVisitorId,
  normalizeVisitorId,
  sessionMemoryTag,
  visitorMemoryTag,
} from '@/lib/widget-visitor';

describe('widget-visitor', () => {
  it('normalizeVisitorId acepta ids vis_* válidos', () => {
    const id = createVisitorId();
    expect(normalizeVisitorId(id)).toBe(id);
    expect(normalizeVisitorId(`  ${id}  `)).toBe(id);
  });

  it('normalizeVisitorId rechaza valores inválidos', () => {
    expect(normalizeVisitorId('')).toBeNull();
    expect(normalizeVisitorId('user-123')).toBeNull();
    expect(normalizeVisitorId('vis_short')).toBeNull();
    expect(normalizeVisitorId(null)).toBeNull();
  });

  it('createVisitorId genera prefijo vis_', () => {
    const id = createVisitorId();
    expect(id.startsWith('vis_')).toBe(true);
    expect(normalizeVisitorId(id)).toBe(id);
  });

  it('tags de memoria incluyen prefijos estables', () => {
    expect(visitorMemoryTag('vis_abc12345678901')).toBe('widget-visitor:vis_abc12345678901');
    expect(sessionMemoryTag('sess-1')).toBe('widget-session:sess-1');
  });
});
