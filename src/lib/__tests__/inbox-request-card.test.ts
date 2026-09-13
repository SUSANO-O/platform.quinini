import { describe, it, expect } from 'vitest';
import {
  displayVisitorName,
  visitorInitials,
  avatarPalette,
  lastMessagePreview,
  relativeTime,
  type InboxCardItem,
} from '@/components/dashboard/inbox-request-card';

const base: InboxCardItem = {
  sessionId: 'sess-1',
  widgetName: 'Tribu GPS',
  handoffAt: '2026-09-13T11:00:00.000Z',
  inboxStatus: 'open',
  contact: {},
  handoffMessage: '',
  lastMessage: '',
  lastMessageAt: null,
  lastHasAttachments: false,
  messageCount: 0,
  hasUnread: false,
  needsReply: false,
  humanMode: false,
  visitorId: 'v-abc',
  followUpAt: null,
  followUpNote: '',
};

describe('visitorInitials', () => {
  it('toma las iniciales de nombre y apellido', () => {
    expect(visitorInitials({ ...base, contact: { name: 'Eduar Terán' } })).toBe('ET');
  });

  it('con un solo nombre usa las dos primeras letras', () => {
    expect(visitorInitials({ ...base, contact: { name: 'Eduar' } })).toBe('ED');
  });

  it('ignora los espacios de sobra entre nombres', () => {
    expect(visitorInitials({ ...base, contact: { name: '  María   Restrepo ' } })).toBe('MR');
  });

  it('sin nombre cae a los últimos dígitos del teléfono', () => {
    expect(visitorInitials({ ...base, contact: { phone: '+57 300 123 4567' } })).toBe('67');
  });

  // Sin nombre ni teléfono el avatar tiene que pintar algo igual.
  it('sin nada, una V de visitante', () => {
    expect(visitorInitials(base)).toBe('V');
  });
});

describe('avatarPalette', () => {
  it('el mismo visitante recibe siempre el mismo color', () => {
    const item = { ...base, contact: { name: 'Eduar Terán' } };
    expect(avatarPalette(item)).toBe(avatarPalette({ ...item }));
  });

  it('devuelve un color de la paleta, con sus tres tonos', () => {
    const p = avatarPalette(base);
    expect(p).toEqual(expect.objectContaining({
      bg: expect.any(String), fg: expect.any(String), border: expect.any(String),
    }));
  });
});

describe('lastMessagePreview', () => {
  it('el último mensaje manda', () => {
    expect(lastMessagePreview({ ...base, lastMessage: '  Hola  ' })).toBe('Hola');
  });

  it('un adjunto sin texto se anuncia como adjunto', () => {
    expect(lastMessagePreview({ ...base, lastHasAttachments: true })).toBe('Adjunto enviado');
  });

  // Con texto, el texto gana aunque venga un adjunto.
  it('con texto y adjunto, se muestra el texto', () => {
    expect(lastMessagePreview({ ...base, lastHasAttachments: true, lastMessage: 'mirá esto' })).toBe('mirá esto');
  });

  it('si no hay mensaje, sirve el motivo del handoff', () => {
    expect(lastMessagePreview({ ...base, handoffMessage: 'Pidió hablar con alguien' })).toBe('Pidió hablar con alguien');
  });

  it('y si no hay nada, lo dice', () => {
    expect(lastMessagePreview(base)).toBe('Sin mensajes aún');
  });
});

describe('relativeTime', () => {
  // Se le pasa el "ahora" en vez de congelar el reloj: la función lo acepta
  // justamente para poder comprobarla. Las horas de referencia están en UTC
  // y las conclusiones, en hora Colombia.
  const ahora = new Date('2026-09-13T17:00:00.000Z'); // 12:00 en Bogotá

  it('lo de recién es "ahora"', () => {
    expect(relativeTime('2026-09-13T16:59:30.000Z', ahora)).toBe('ahora');
  });

  it('minutos y horas', () => {
    expect(relativeTime('2026-09-13T16:40:00.000Z', ahora)).toBe('hace 20 min');
    expect(relativeTime('2026-09-13T14:00:00.000Z', ahora)).toBe('hace 3 h');
  });

  it('ayer se dice con palabra', () => {
    expect(relativeTime('2026-09-12T17:00:00.000Z', ahora)).toBe('ayer');
  });

  // El fallo que se está corrigiendo: por diferencia pura, 20 horas atrás
  // era "hace 20 h" aunque en Colombia ya fuera el día anterior.
  it('cruzar la medianoche de Colombia ya cuenta como ayer', () => {
    expect(relativeTime('2026-09-12T21:00:00.000Z', ahora)).toBe('ayer');
  });

  // Y al revés: de madrugada, algo de hace 8 horas sigue siendo del mismo día.
  it('dentro del mismo día sigue contando horas', () => {
    const madrugada = new Date('2026-09-13T13:00:00.000Z'); // 08:00 en Bogotá
    expect(relativeTime('2026-09-13T06:00:00.000Z', madrugada)).toBe('hace 7 h');
  });

  it('más atrás va con fecha y hora', () => {
    expect(relativeTime('2026-09-01T17:00:00.000Z', ahora)).toMatch(/\d/);
  });

  it('sin fecha no pinta nada', () => {
    expect(relativeTime(null, ahora)).toBe('');
  });

  it('una fecha inválida tampoco rompe', () => {
    expect(relativeTime('no-es-fecha', ahora)).toBe('');
  });
});

describe('displayVisitorName', () => {
  it('usa el nombre del contacto cuando existe', () => {
    expect(displayVisitorName({ ...base, contact: { name: 'Eduar Terán' } })).toContain('Eduar');
  });

  // Nunca debe quedar en blanco: la tarjeta necesita un título.
  it('sin contacto sigue devolviendo algo que mostrar', () => {
    expect(displayVisitorName(base).length).toBeGreaterThan(0);
  });
});
