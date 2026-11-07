/**
 * El chat del widget no puede llegar al hub sin un widget validado.
 * Reproduce el hueco de 2026-11: sin token o con un `wt_…` inventado, la petición seguía al hub y
 * la ruta de streaming le firmaba "token válido" (X-Landing-Wt-Valid) → cualquiera usaba el agente
 * de cualquier cliente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findWidget = vi.fn();

vi.mock('@/lib/db/connection', () => ({ connectDB: async () => undefined }));
vi.mock('@/lib/widget-token-verify', async (orig) => ({
  ...(await orig<typeof import('@/lib/widget-token-verify')>()),
  findWidgetForWtToken: (...a: unknown[]) => findWidget(...a),
}));

const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));

function body(token?: string) {
  return JSON.stringify({
    agentId: 'agente-de-otro-cliente',
    message: 'hola',
    sessionId: 'sess_test_12345678',
    ...(token !== undefined ? { token } : {}),
  });
}

function mk(path: string, token?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: body(token),
    headers: { 'content-type': 'application/json', origin: 'https://atacante.example' },
  });
}

describe('chat del widget sin widget validado', () => {
  beforeEach(() => {
    findWidget.mockReset().mockResolvedValue(null);
    fetchSpy.mockClear();
    vi.stubGlobal('fetch', fetchSpy);
    process.env.HUB_TO_LANDING_SECRET = 'secreto-de-prueba';
  });
  afterEach(() => vi.unstubAllGlobals());

  for (const [label, token] of [
    ['sin token', undefined],
    ['token inventado wt_', 'wt_tokenfalso000000000000000000'],
  ] as const) {
    it(`stream: ${label} → 401 y no llama al hub`, async () => {
      const { POST } = await import('@/app/api/widget/chat/stream/route');
      const res = await POST(mk('/api/widget/chat/stream', token));
      expect(res.status).toBe(401);
      expect(await res.text()).toContain('WIDGET_TOKEN_INVALID');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it(`no stream: ${label} → 401 y no llama al hub`, async () => {
      const { POST } = await import('@/app/api/widget/chat/route');
      const res = await POST(mk('/api/widget/chat', token));
      expect(res.status).toBe(401);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  it('si la base no responde al validar: 503 (falla cerrado), no sigue al hub', async () => {
    findWidget.mockRejectedValue(new Error('mongo caído'));
    const { POST } = await import('@/app/api/widget/chat/stream/route');
    const res = await POST(mk('/api/widget/chat/stream', 'wt_tokenfalso000000000000000000'));
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
