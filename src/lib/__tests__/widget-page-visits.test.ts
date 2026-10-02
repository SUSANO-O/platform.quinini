import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateOne = vi.fn();
const countDocuments = vi.fn();
const findById = vi.fn();

vi.mock('@/lib/db/models', () => ({
  WidgetPageVisit: { updateOne: (...a: unknown[]) => updateOne(...a), countDocuments: (...a: unknown[]) => countDocuments(...a) },
  Widget: { findById: (...a: unknown[]) => findById(...a) },
}));

import {
  __resetAppMapCacheForTests,
  getWidgetAppMap,
  MAX_DISCOVERED_PATHS,
  recordWidgetPageVisit,
} from '@/lib/widget-page-visits';

beforeEach(() => {
  updateOne.mockReset();
  countDocuments.mockReset();
  findById.mockReset();
  __resetAppMapCacheForTests();
});

const W = { widgetId: 'w1', userId: 'u1' };

describe('recordWidgetPageVisit', () => {
  it('ruta conocida: suma visita, añade pestaña y NOMBRES de parámetros (sin valores)', async () => {
    updateOne.mockResolvedValue({ matchedCount: 1 });
    await recordWidgetPageVisit({ ...W, pagePath: 'https://t.com/views/visorDisp.php?k_disp=Xch4645&token=s#eventos' });
    expect(updateOne).toHaveBeenCalledTimes(3);
    expect(updateOne.mock.calls[0][0]).toEqual({ widgetId: 'w1', path: '/views/visorDisp.php' });
    expect(updateOne.mock.calls[1][1]).toEqual({ $addToSet: { hashes: 'eventos' } });
    expect(updateOne.mock.calls[2][1]).toEqual({ $addToSet: { paramKeys: { $each: ['k_disp'] } } });
    expect(JSON.stringify(updateOne.mock.calls)).not.toContain('Xch4645');
    expect(countDocuments).not.toHaveBeenCalled();
  });

  it('ruta nueva: la crea si hay cupo', async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 0 }).mockResolvedValue({ matchedCount: 1 });
    countDocuments.mockResolvedValue(3);
    await recordWidgetPageVisit({ ...W, pagePath: '/views/logs.php' });
    expect(updateOne.mock.calls[1][2]).toEqual({ upsert: true });
    expect(updateOne.mock.calls[1][1].$setOnInsert.userId).toBe('u1');
  });

  it('cupo lleno: no crea rutas nuevas', async () => {
    updateOne.mockResolvedValue({ matchedCount: 0 });
    countDocuments.mockResolvedValue(MAX_DISCOVERED_PATHS);
    await recordWidgetPageVisit({ ...W, pagePath: '/views/nueva.php#x' });
    expect(updateOne).toHaveBeenCalledTimes(1);
  });

  it('ruta inválida o sin widget: no escribe; errores de BD no se propagan', async () => {
    await recordWidgetPageVisit({ ...W, pagePath: 'javascript:alert(1)' });
    await recordWidgetPageVisit({ widgetId: '', userId: 'u', pagePath: '/a.php' });
    expect(updateOne).not.toHaveBeenCalled();
    updateOne.mockRejectedValue(new Error('down'));
    await expect(recordWidgetPageVisit({ ...W, pagePath: '/a.php' })).resolves.toBeUndefined();
  });
});

describe('getWidgetAppMap', () => {
  const lean = (v: unknown) => ({ select: () => ({ lean: async () => v }) });

  it('lee, normaliza y cachea', async () => {
    findById.mockReturnValue(lean({ appMap: [{ path: '/a.php?x=1', name: 'A' }, { path: 'mal', name: 'B' }] }));
    expect(await getWidgetAppMap('w1')).toEqual([{ path: '/a.php', name: 'A' }]);
    await getWidgetAppMap('w1');
    expect(findById).toHaveBeenCalledTimes(1);
  });

  it('sin widget o sin mapa → []', async () => {
    findById.mockReturnValue(lean(null));
    expect(await getWidgetAppMap('w2')).toEqual([]);
    expect(await getWidgetAppMap('')).toEqual([]);
  });
});
