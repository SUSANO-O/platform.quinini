import { describe, it, expect } from 'vitest';
import { visibleChatSessions, tieneMensajes } from '../conversations-list-view';

const chat = (id: string, messageCount: number, lastMessageAt: string | null) => ({
  sessionId: id,
  messageCount,
  lastMessageAt,
});

describe('tieneMensajes', () => {
  it('descarta el chat que se abrió y nunca se escribió', () => {
    expect(tieneMensajes(chat('a', 0, null))).toBe(false);
    expect(tieneMensajes(chat('b', 1, '2026-09-04T10:00:00Z'))).toBe(true);
  });

  it('no cuela un chat sin messageCount', () => {
    expect(tieneMensajes({})).toBe(false);
  });
});

describe('visibleChatSessions', () => {
  it('ordena por última actividad, lo más reciente primero', () => {
    const rows = [
      chat('viejo', 3, '2026-09-01T10:00:00Z'),
      chat('nuevo', 2, '2026-09-04T18:00:00Z'),
      chat('medio', 5, '2026-09-03T09:00:00Z'),
    ];
    expect(visibleChatSessions(rows, 10).map((r) => r.sessionId)).toEqual(['nuevo', 'medio', 'viejo']);
  });

  it('un chat abierto hace días con un mensaje reciente va primero', () => {
    // El motivo de ordenar por actividad y no por apertura: esto es lo más
    // urgente que hay y antes quedaba sepultado.
    const rows = [
      chat('abierto-hoy', 1, '2026-09-04T08:00:00Z'),
      chat('abierto-ayer-activo-ahora', 4, '2026-09-04T19:00:00Z'),
    ];
    expect(visibleChatSessions(rows, 10)[0]?.sessionId).toBe('abierto-ayer-activo-ahora');
  });

  it('quita los vacíos aunque sean los más recientes', () => {
    const rows = [
      chat('vacio-recien-abierto', 0, null),
      chat('con-mensajes', 2, '2026-09-01T10:00:00Z'),
    ];
    expect(visibleChatSessions(rows, 10).map((r) => r.sessionId)).toEqual(['con-mensajes']);
  });

  it('recorta al límite DESPUÉS de filtrar, para no devolver de menos', () => {
    // Si se recortara antes, una tanda de vacíos dejaría la lista casi vacía.
    const rows = [
      chat('v1', 0, null),
      chat('v2', 0, null),
      chat('r1', 1, '2026-09-04T10:00:00Z'),
      chat('r2', 1, '2026-09-03T10:00:00Z'),
    ];
    expect(visibleChatSessions(rows, 2).map((r) => r.sessionId)).toEqual(['r1', 'r2']);
  });

  it('manda al fondo los que no tienen fecha válida, sin romper', () => {
    const rows = [
      chat('sin-fecha', 2, null),
      chat('con-fecha', 1, '2026-09-02T10:00:00Z'),
      chat('fecha-basura', 1, 'no-es-una-fecha'),
    ];
    expect(visibleChatSessions(rows, 10)[0]?.sessionId).toBe('con-fecha');
    expect(visibleChatSessions(rows, 10)).toHaveLength(3);
  });

  it('no muta la lista original', () => {
    const rows = [chat('a', 1, '2026-09-01T10:00:00Z'), chat('b', 1, '2026-09-04T10:00:00Z')];
    const copia = [...rows];
    visibleChatSessions(rows, 10);
    expect(rows).toEqual(copia);
  });
});
