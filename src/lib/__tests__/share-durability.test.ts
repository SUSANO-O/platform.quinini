import { describe, it, expect } from 'vitest';
import {
  SHARE_NEVER_EXPIRES,
  shareExpiresAt,
  esInstalable,
  nombreCortoApp,
  esUnidadDuradera,
} from '../share-durability';

describe('shareExpiresAt', () => {
  it('no cambia el cálculo de las unidades que ya existían', () => {
    const antes = Date.now();
    const h = shareExpiresAt(8, 'hours').getTime();
    expect(h - antes).toBeGreaterThanOrEqual(8 * 3_600_000 - 50);
    expect(h - antes).toBeLessThanOrEqual(8 * 3_600_000 + 50);

    const d = shareExpiresAt(3, 'days').getTime();
    expect(d - antes).toBeGreaterThanOrEqual(3 * 86_400_000 - 50);
  });

  it('never devuelve una fecha que el TTL de Mongo no alcanza nunca', () => {
    // El índice TTL borra cuando expiresAt <= ahora. El centinela tiene que
    // estar tan lejos que eso no pase en la vida útil del producto.
    const t = shareExpiresAt(0, 'never');
    expect(t.getTime()).toBe(SHARE_NEVER_EXPIRES.getTime());
    expect(t.getFullYear()).toBeGreaterThan(9000);
  });

  it('devuelve una copia del centinela, no la constante compartida', () => {
    // Mutar el centinela desde una llamada afectaría a todas las demás.
    const a = shareExpiresAt(0, 'never');
    a.setFullYear(2000);
    expect(SHARE_NEVER_EXPIRES.getFullYear()).toBeGreaterThan(9000);
    expect(shareExpiresAt(0, 'never').getFullYear()).toBeGreaterThan(9000);
  });

  it('una unidad desconocida cae en horas, como antes', () => {
    const antes = Date.now();
    const t = shareExpiresAt(2, 'inventada' as never).getTime();
    expect(t - antes).toBeGreaterThanOrEqual(2 * 3_600_000 - 50);
  });

  it('esUnidadDuradera solo reconoce never', () => {
    expect(esUnidadDuradera('never')).toBe(true);
    for (const u of ['hours', 'days', 'weeks', 'months', '']) {
      expect(esUnidadDuradera(u)).toBe(false);
    }
  });
});

describe('esInstalable', () => {
  const futuro = new Date(Date.now() + 86_400_000);

  it('solo un share duradero, activo y vigente', () => {
    expect(esInstalable({ permanent: true, active: true, expiresAt: futuro })).toBe(true);
  });

  it('un share revocado no se instala aunque sea duradero', () => {
    // Si no, revocar dejaría de significar nada para quien ya lo tiene puesto.
    expect(esInstalable({ permanent: true, active: false, expiresAt: futuro })).toBe(false);
  });

  it('un share temporal no se instala', () => {
    expect(esInstalable({ permanent: false, active: true, expiresAt: futuro })).toBe(false);
    expect(esInstalable({ active: true, expiresAt: futuro })).toBe(false);
  });

  it('un share caducado no se instala', () => {
    const pasado = new Date(Date.now() - 1000);
    expect(esInstalable({ permanent: true, active: true, expiresAt: pasado })).toBe(false);
  });

  it('aguanta fechas ausentes o basura sin romper', () => {
    expect(esInstalable({ permanent: true, active: true, expiresAt: null })).toBe(false);
    expect(esInstalable({ permanent: true, active: true, expiresAt: 'ayer' })).toBe(false);
    expect(esInstalable({})).toBe(false);
  });

  it('acepta la fecha como cadena ISO, que es como llega del JSON', () => {
    expect(esInstalable({ permanent: true, active: true, expiresAt: futuro.toISOString() })).toBe(true);
  });
});

describe('nombreCortoApp', () => {
  it('deja pasar un nombre corto tal cual', () => {
    expect(nombreCortoApp('Ventas')).toBe('Ventas');
  });

  it('recorta uno largo sin dejar el espacio colgando', () => {
    expect(nombreCortoApp('Asesor de Ventas Premium')).toBe('Asesor de');
  });

  it('nunca devuelve vacío', () => {
    expect(nombreCortoApp('')).toBe('Agente');
    expect(nombreCortoApp('   ')).toBe('Agente');
  });
});
