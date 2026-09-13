import { describe, it, expect } from 'vitest';
import { AVATAR_PALETTE, paletteFromKey, initialsFrom } from '@/lib/panel-identity';

describe('paletteFromKey', () => {
  it('la misma clave da siempre el mismo color', () => {
    expect(paletteFromKey('sess-abc')).toBe(paletteFromKey('sess-abc'));
  });

  it('siempre devuelve un color de la paleta', () => {
    for (const clave of ['a', 'sess-1', 'Eduar Terán', '+573001234567', '']) {
      expect(AVATAR_PALETTE).toContain(paletteFromKey(clave));
    }
  });

  it('reparte entre distintas claves', () => {
    const vistos = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k) => paletteFromKey(k).bg),
    );
    expect(vistos.size).toBeGreaterThan(1);
  });

  it('cada entrada trae fondo, texto y borde', () => {
    for (const c of AVATAR_PALETTE) {
      expect(c.bg).toMatch(/^#/);
      expect(c.fg).toMatch(/^#/);
      expect(c.border).toMatch(/^#/);
    }
  });
});

describe('initialsFrom', () => {
  it('nombre y apellido', () => {
    expect(initialsFrom('Eduar Terán')).toBe('ET');
  });

  it('un solo nombre da las dos primeras letras', () => {
    expect(initialsFrom('Eduar')).toBe('ED');
  });

  it('ignora los espacios de sobra', () => {
    expect(initialsFrom('  María   Restrepo  ')).toBe('MR');
  });

  it('toma solo las dos primeras palabras', () => {
    expect(initialsFrom('Juan Carlos Pérez Gómez')).toBe('JC');
  });

  // El avatar necesita pintar algo aunque no haya etiqueta.
  it('sin texto devuelve el relleno pedido', () => {
    expect(initialsFrom('', 'V')).toBe('V');
    expect(initialsFrom('   ', 'V')).toBe('V');
  });

  it('sin relleno explícito usa un interrogante', () => {
    expect(initialsFrom('')).toBe('?');
  });

  it('una sola letra no se rompe', () => {
    expect(initialsFrom('A')).toBe('A');
  });
});
