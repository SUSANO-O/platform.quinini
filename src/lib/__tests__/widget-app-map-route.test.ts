import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findOne = vi.fn();
const updateOne = vi.fn();
vi.mock('@/lib/db/connection', () => ({ connectDB: async () => undefined }));
vi.mock('@/lib/auth', () => ({ verifySessionToken: (t: string) => (t === 'ok' ? 'u1' : null) }));
vi.mock('@/lib/db/models', () => ({
  Widget: { findOne: (...a: unknown[]) => findOne(...a), updateOne: (...a: unknown[]) => updateOne(...a) },
  WidgetPageVisit: {},
}));

import { GET, PUT } from '@/app/api/widgets/[id]/app-map/route';

const ID = 'c'.repeat(24);
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (method: string, body?: unknown, cookie = 'ok', qs = '') =>
  new NextRequest(`http://x/api/widgets/${ID}/app-map${qs}`, {
    method,
    headers: { cookie: `afhub_session=${cookie}`, 'content-type': 'application/json' },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
const lean = (v: unknown) => ({ select: () => ({ lean: async () => v }) });

beforeEach(() => {
  findOne.mockReset();
  updateOne.mockReset();
});

describe('/api/widgets/[id]/app-map', () => {
  it('sin sesión → 401', async () => {
    expect((await GET(req('GET', undefined, 'mala'), ctx)).status).toBe(401);
  });

  it('GET filtra por dueño y devuelve el mapa normalizado', async () => {
    findOne.mockReturnValue(lean({ appMap: [{ path: '/a.php', name: 'A' }] }));
    const res = await GET(req('GET'), ctx);
    expect(findOne).toHaveBeenCalledWith({ _id: ID, userId: 'u1' });
    expect(await res.json()).toEqual({ appMap: [{ path: '/a.php', name: 'A' }] });
  });

  it('GET ?format=csv descarga CSV', async () => {
    findOne.mockReturnValue(lean({ name: 'Navi App', appMap: [{ path: '/a.php', name: 'A' }] }));
    const res = await GET(req('GET', undefined, 'ok', '?format=csv'), ctx);
    expect(res.headers.get('content-disposition')).toContain('mapa-navi-app.csv');
    expect(await res.text()).toContain('/a.php,A');
  });

  it('PUT con CSV guarda solo filas válidas y devuelve los errores', async () => {
    updateOne.mockResolvedValue({ matchedCount: 1 });
    const res = await PUT(req('PUT', { csv: 'path,name\n/a.php,A\nmal,B' }), ctx);
    expect(res.status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith({ _id: ID, userId: 'u1' }, { $set: { appMap: [{ path: '/a.php', name: 'A' }] } });
    expect((await res.json()).errors).toHaveLength(1);
  });

  it('PUT sin filas válidas → 400 y no escribe', async () => {
    const res = await PUT(req('PUT', { appMap: [{ path: 'https://evil', name: '' }] }), ctx);
    expect(res.status).toBe(400);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('PUT lista vacía = borrar el mapa', async () => {
    updateOne.mockResolvedValue({ matchedCount: 1 });
    expect((await PUT(req('PUT', { appMap: [] }), ctx)).status).toBe(200);
    expect(updateOne.mock.calls[0][1]).toEqual({ $set: { appMap: [] } });
  });

  it('PUT a widget ajeno → 404', async () => {
    updateOne.mockResolvedValue({ matchedCount: 0 });
    expect((await PUT(req('PUT', { appMap: [{ path: '/a.php', name: 'A' }] }), ctx)).status).toBe(404);
  });
});
