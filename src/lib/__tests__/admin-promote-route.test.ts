import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdmin = vi.fn();
const rate = vi.fn();
const findOneAndUpdate = vi.fn();

vi.mock('@/lib/db/connection', () => ({ connectDB: async () => undefined }));
vi.mock('@/lib/admin-auth', () => ({ requireAdmin: (req: unknown) => requireAdmin(req) }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitAsync: (...a: unknown[]) => rate(...a),
  getClientIp: () => '1.2.3.4',
}));
vi.mock('@/lib/db/models', () => ({ User: { findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a) } }));

const { POST } = await import('@/app/api/admin/promote/route');

const SECRET = 'un-secreto-largo-de-prueba-0123456789';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/admin/promote', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/admin/promote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = SECRET;
    rate.mockResolvedValue({ success: true });
    requireAdmin.mockResolvedValue('admin_1');
    findOneAndUpdate.mockResolvedValue({ _id: 'u2', email: 'x@y.com', role: 'admin' });
  });

  it('rechaza sin sesión de admin aunque el secreto sea correcto', async () => {
    requireAdmin.mockResolvedValue(null);
    const res = await POST(req({ email: 'x@y.com', secret: SECRET }));
    expect(res.status).toBe(401);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rechaza a un admin con el secreto equivocado o de otro largo', async () => {
    for (const secret of ['otro', `${SECRET}x`, SECRET.replace(/.$/, 'Z'), 123, undefined]) {
      const res = await POST(req({ email: 'x@y.com', secret }));
      expect(res.status).toBe(401);
    }
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rechaza si ADMIN_SECRET no está configurado', async () => {
    delete process.env.ADMIN_SECRET;
    const res = await POST(req({ email: 'x@y.com', secret: '' }));
    expect(res.status).toBe(401);
  });

  it('corta por límite de intentos antes de mirar la sesión', async () => {
    rate.mockResolvedValue({ success: false });
    const res = await POST(req({ email: 'x@y.com', secret: SECRET }));
    expect(res.status).toBe(429);
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(rate).toHaveBeenCalledWith('admin-promote', '1.2.3.4', 5, 15 * 60_000);
  });

  it('promueve con sesión de admin + secreto correcto', async () => {
    const res = await POST(req({ email: '  X@Y.com ', secret: SECRET }));
    expect(res.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith({ email: 'x@y.com' }, { role: 'admin' }, { new: true });
  });

  it('400 sin email (antes reventaba con 500)', async () => {
    const res = await POST(req({ secret: SECRET }));
    expect(res.status).toBe(400);
  });
});
