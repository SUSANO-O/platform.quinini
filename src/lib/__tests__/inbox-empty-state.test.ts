import { describe, it, expect } from 'vitest';
import { resolveInboxEmptyState } from '@/lib/inbox-empty-state';

const base = { tab: 'open' as const, replyFilter: 'unanswered' as const, unanswered: 0, answered: 0 };

describe('resolveInboxEmptyState', () => {
  it('sin nada abierto, el mensaje de siempre y ningún atajo', () => {
    const r = resolveInboxEmptyState(base);
    expect(r.title).toBe('Sin mensajes pendientes de respuesta');
    expect(r.switchTo).toBeNull();
  });

  // El caso que se está arreglando: cero pendientes pero seis abiertas al
  // lado. Antes la pantalla decía "sin mensajes" y el cliente se iba.
  it('si el otro filtro tiene conversaciones, lo dice y ofrece el salto', () => {
    const r = resolveInboxEmptyState({ ...base, answered: 6 });
    expect(r.switchTo).toBe('answered');
    expect(r.hint).toContain('6');
    expect(r.actionLabel).toBeTruthy();
  });

  it('singular cuando es una sola', () => {
    const r = resolveInboxEmptyState({ ...base, answered: 1 });
    expect(r.hint).toMatch(/1 conversación\b/);
    expect(r.hint).not.toMatch(/conversaciones/);
  });

  it('funciona también al revés: estás en respondidas y hay pendientes', () => {
    const r = resolveInboxEmptyState({ ...base, replyFilter: 'answered', unanswered: 3 });
    expect(r.title).toBe('Sin conversaciones respondidas');
    expect(r.switchTo).toBe('unanswered');
    expect(r.hint).toContain('3');
  });

  // En la pestaña de resueltas no hay dos filtros entre los que saltar.
  it('la pestaña de resueltas no ofrece salto', () => {
    const r = resolveInboxEmptyState({ ...base, tab: 'resolved', answered: 9 });
    expect(r.title).toBe('Sin conversaciones resueltas');
    expect(r.switchTo).toBeNull();
  });

  it('nunca ofrece saltar al filtro en el que ya estás', () => {
    const r = resolveInboxEmptyState({ ...base, unanswered: 5 });
    expect(r.switchTo).toBeNull();
  });

  it('un conteo negativo no inventa un atajo', () => {
    expect(resolveInboxEmptyState({ ...base, answered: -2 }).switchTo).toBeNull();
  });

  it('siempre da un texto de ayuda, haya o no atajo', () => {
    expect(resolveInboxEmptyState(base).hint.length).toBeGreaterThan(0);
    expect(resolveInboxEmptyState({ ...base, answered: 4 }).hint.length).toBeGreaterThan(0);
  });
});
