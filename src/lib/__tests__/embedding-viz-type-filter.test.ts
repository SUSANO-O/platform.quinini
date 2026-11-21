import { describe, expect, it } from 'vitest';
import { isTypeVisible, toggleTypeSelection, visibleCount } from '../embedding-viz-options';

describe('filtro de tipos en la leyenda del visor 3D', () => {
  const counts = { chunk: 800, conversation: 150, document: 50 };

  it('sin selección se ven todos', () => {
    const none = new Set<string>();
    expect(isTypeVisible(none, 'chunk')).toBe(true);
    expect(visibleCount(counts, none)).toBe(1000);
  });

  it('al elegir un tipo se ve solo ese', () => {
    const only = toggleTypeSelection(new Set(), 'conversation');
    expect(isTypeVisible(only, 'conversation')).toBe(true);
    expect(isTypeVisible(only, 'chunk')).toBe(false);
    expect(visibleCount(counts, only)).toBe(150);
  });

  it('se pueden sumar varios, y quitar el último vuelve a mostrar todo', () => {
    let s = toggleTypeSelection(new Set(), 'conversation');
    s = toggleTypeSelection(s, 'document');
    expect(visibleCount(counts, s)).toBe(200);
    s = toggleTypeSelection(s, 'conversation');
    expect(visibleCount(counts, s)).toBe(50);
    s = toggleTypeSelection(s, 'document');
    expect(s.size).toBe(0);
    expect(visibleCount(counts, s)).toBe(1000);
  });

  it('no muta la selección anterior', () => {
    const a = new Set(['chunk']);
    toggleTypeSelection(a, 'document');
    expect([...a]).toEqual(['chunk']);
  });
});
