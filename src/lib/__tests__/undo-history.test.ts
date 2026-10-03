import { describe, expect, it } from 'vitest';
import { emptyHistory, recordChange, redo, undo, UNDO_LIMIT } from '@/lib/widget-builder/undo-history';

describe('undo-history', () => {
  it('deshacer y rehacer recorren los estados en orden', () => {
    let h = emptyHistory<string>();
    h = recordChange(h, 'A', 1000);
    h = recordChange(h, 'B', 3000);
    const u1 = undo(h, 'C')!;
    expect(u1.state).toBe('B');
    const u2 = undo(u1.history, 'B')!;
    expect(u2.state).toBe('A');
    expect(undo(u2.history, 'A')).toBeNull();
    const r1 = redo(u2.history, 'A')!;
    expect(r1.state).toBe('B');
    expect(redo(r1.history, 'B')!.state).toBe('C');
  });

  it('cambios seguidos se agrupan en un solo paso', () => {
    let h = emptyHistory<number>();
    h = recordChange(h, 10, 1000);
    h = recordChange(h, 11, 1200);
    h = recordChange(h, 12, 1400);
    expect(h.past).toEqual([10]);
  });

  it('un cambio nuevo borra lo que se podía rehacer', () => {
    let h = recordChange(emptyHistory<string>(), 'A', 1000);
    const u = undo(h, 'B')!;
    h = recordChange(u.history, 'A', 9000);
    expect(redo(h, 'X')).toBeNull();
  });

  it('limita la memoria', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < UNDO_LIMIT + 20; i++) h = recordChange(h, i, i * 1000);
    expect(h.past).toHaveLength(UNDO_LIMIT);
    expect(h.past[0]).toBe(20);
  });
});
