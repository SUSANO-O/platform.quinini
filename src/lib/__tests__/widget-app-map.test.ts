import { describe, expect, it } from 'vitest';
import {
  APP_MAP_MAX_ENTRIES,
  appMapContextBlock,
  appMapFromCsv,
  appMapToCsv,
  normalizeAppMap,
  pageVisitFromPagePath,
  type AppMapEntry,
} from '@/lib/widget-app-map';

const visor: AppMapEntry = {
  path: '/views/visorDisp.php',
  name: 'Ficha del dispositivo',
  description: 'Vista individual de un vehículo.',
  tabs: [
    { hash: 'actual', name: 'Posición Actual', description: 'Dónde está ahora.' },
    { hash: 'routes-day', name: 'Ruta Día', description: 'Recorrido en un rango de fechas.' },
  ],
};
const geo: AppMapEntry = { path: '/views/geocercas.php', name: 'Geocercas', description: 'Zonas con alertas.' };

describe('normalizeAppMap', () => {
  it('acepta un mapa válido y limpia espacios', () => {
    const { map, errors } = normalizeAppMap([{ ...geo, name: '  Geocercas  ' }, visor]);
    expect(errors).toEqual([]);
    expect(map).toEqual([geo, visor]);
  });

  it('quita query y # de la ruta y une rutas repetidas', () => {
    const { map } = normalizeAppMap([
      { path: '/views/geocercas.php?path=x#y', name: 'Geocercas' },
      { path: '/views/geocercas.php', name: 'Otra' },
    ]);
    expect(map).toEqual([{ path: '/views/geocercas.php', name: 'Geocercas' }]);
  });

  it('rechaza rutas de otro dominio o raras, con un error por fila', () => {
    const { map, errors } = normalizeAppMap([
      { path: 'javascript:alert(1)', name: 'x' },
      { path: '//evil.com', name: 'x' },
      { path: '/ok.php', name: '' },
      { path: '/bien.php', name: 'Bien' },
    ]);
    expect(map).toEqual([{ path: '/bien.php', name: 'Bien' }]);
    expect(errors).toHaveLength(3);
  });

  it('acepta URL absoluta y se queda con la ruta', () => {
    expect(normalizeAppMap([{ path: 'https://www.tribugps.com/views/logs.php?a=1', name: 'Logs' }]).map).toEqual([
      { path: '/views/logs.php', name: 'Logs' },
    ]);
  });

  it('valida pestañas: ancla con o sin #, descarta inválidas', () => {
    const { map } = normalizeAppMap([
      { path: '/v.php', name: 'V', tabs: [{ hash: '#eventos', name: 'Eventos' }, { hash: 'a b', name: 'Mal' }, { hash: 'x', name: '' }] },
    ]);
    expect(map[0].tabs).toEqual([{ hash: 'eventos', name: 'Eventos' }]);
  });

  it('recorta textos largos y limita el número de vistas', () => {
    const many = Array.from({ length: APP_MAP_MAX_ENTRIES + 5 }, (_, i) => ({ path: `/p${i}.php`, name: `P${i}`, description: 'd'.repeat(2000) }));
    const { map, errors } = normalizeAppMap(many);
    expect(map).toHaveLength(APP_MAP_MAX_ENTRIES);
    expect(map[0].description!.length).toBeLessThanOrEqual(500);
    expect(errors.some((e) => /máximo/i.test(e))).toBe(true);
  });

  it('entrada que no es lista → error', () => {
    expect(normalizeAppMap({ a: 1 }).errors[0]).toMatch(/lista/);
  });
});

describe('CSV', () => {
  it('ida y vuelta conserva el mapa (comas, comillas y saltos incluidos)', () => {
    const tricky: AppMapEntry = { path: '/a.php', name: 'Uno, "dos"', description: 'línea 1\nlínea 2' };
    const csv = appMapToCsv([visor, tricky, geo]);
    expect(appMapFromCsv(csv)).toEqual({ map: [visor, tricky, geo], errors: [] });
  });

  it('una fila por pestaña; las filas de pestaña se cuelgan de su ruta', () => {
    const csv = [
      'path,name,description,tab_hash,tab_name,tab_description',
      '/views/visorDisp.php,Ficha del dispositivo,Vista individual,,,',
      '/views/visorDisp.php,,,eventos,Eventos,Historial',
      '/views/visorDisp.php,,,actions,Acciones,',
    ].join('\n');
    expect(appMapFromCsv(csv).map).toEqual([
      {
        path: '/views/visorDisp.php',
        name: 'Ficha del dispositivo',
        description: 'Vista individual',
        tabs: [
          { hash: 'eventos', name: 'Eventos', description: 'Historial' },
          { hash: 'actions', name: 'Acciones' },
        ],
      },
    ]);
  });

  it('acepta ; como separador (Excel en español) y cabeceras en español', () => {
    const csv = 'ruta;nombre;descripcion\n/views/logs.php;Logs;Registro';
    expect(appMapFromCsv(csv).map).toEqual([{ path: '/views/logs.php', name: 'Logs', description: 'Registro' }]);
  });

  it('sin columna path/ruta → error claro', () => {
    expect(appMapFromCsv('a,b\n1,2').errors[0]).toMatch(/path|ruta/);
  });
});

describe('appMapContextBlock', () => {
  it('sin mapa → vacío (el widget se comporta como antes)', () => {
    expect(appMapContextBlock([], '/views/x.php')).toBe('');
    expect(appMapContextBlock(undefined, '/views/x.php')).toBe('');
  });

  it('describe la vista y la pestaña actuales y lista el mapa', () => {
    const block = appMapContextBlock(
      [geo, visor],
      'https://www.tribugps.com/views/visorDisp.php?k_disp=Xch4645&desde=2026-10-02#routes-day',
    );
    expect(block).toContain('Vista actual: Ficha del dispositivo (/views/visorDisp.php) — Vista individual de un vehículo.');
    expect(block).toContain('Pestaña actual: Ruta Día (#routes-day) — Recorrido en un rango de fechas.');
    expect(block).toContain('- /views/geocercas.php — Geocercas: Zonas con alertas.');
    expect(block).toContain('#actual Posición Actual');
    expect(block).toMatch(/assist-nav/);
  });

  it('página fuera del mapa → lo dice, y sigue listando el mapa', () => {
    const block = appMapContextBlock([geo], '/views/otra.php');
    expect(block).toContain('no está en el mapa');
    expect(block).toContain('/views/geocercas.php');
  });

  it('no supera el presupuesto aunque el mapa sea enorme', () => {
    const big = Array.from({ length: 300 }, (_, i) => ({ path: `/views/p${i}.php`, name: `Vista ${i}`, description: 'x'.repeat(400) }));
    const block = appMapContextBlock(big, '/views/p1.php', 6000);
    expect(block.length).toBeLessThanOrEqual(6000);
    expect(block).toContain('Vista actual: Vista 1');
  });
});

describe('pageVisitFromPagePath (autodescubrimiento)', () => {
  it('guarda ruta, NOMBRES de parámetros y pestaña; nunca valores', () => {
    expect(
      pageVisitFromPagePath('https://www.tribugps.com/views/visorDisp.php?k_disp=Xch4645&desde=2026-10-02#routes-day'),
    ).toEqual({ path: '/views/visorDisp.php', paramKeys: ['desde', 'k_disp'], hash: 'routes-day' });
  });

  it('descarta nombres de parámetro sensibles', () => {
    expect(pageVisitFromPagePath('/a.php?token=1&session_id=2&q=3')?.paramKeys).toEqual(['q']);
  });

  it('ruta inválida → null', () => {
    expect(pageVisitFromPagePath('javascript:alert(1)')).toBeNull();
    expect(pageVisitFromPagePath('')).toBeNull();
  });
});
