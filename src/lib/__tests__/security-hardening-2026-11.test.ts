import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const rate = vi.fn();
const record = vi.fn();

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitAsync: (...a: unknown[]) => rate(...a),
  getClientIp: () => '9.9.9.9',
}));
vi.mock('@/lib/ab-test-metrics', () => ({ recordAbVariantMetrics: (...a: unknown[]) => record(...a) }));

const { agentToolsAccess } = await import('@/lib/mcp-agent-tools-access');
const { checkWidgetPublicRateLimit, WIDGET_PUBLIC_LIMITS } = await import('@/lib/widget-public-rate-limit');
const { POST: abMetricsPost } = await import('@/app/api/agents/[id]/ab-tests/metrics/route');

describe('agentToolsAccess (GET /api/mcp/agent-tools)', () => {
  it('dueño y admin ven el agente; el resto no', () => {
    expect(agentToolsAccess({ userId: 'u1' }, 'u1', false)).toBe('owner');
    expect(agentToolsAccess({ userId: 'u1' }, 'u2', true)).toBe('admin');
    expect(agentToolsAccess({ userId: 'u1' }, 'u2', false)).toBe('denied');
  });

  it('un agente de plataforma se ve logueado, pero sin ser dueño', () => {
    expect(agentToolsAccess({ userId: 'u1', isPlatform: true }, 'u2', false)).toBe('platform');
  });

  it('sin agente o sin usuario: denegado (antes se consultaba el hub con cualquier id)', () => {
    expect(agentToolsAccess(null, 'u1', true)).toBe('denied');
    expect(agentToolsAccess({ userId: 'u1' }, '', false)).toBe('denied');
  });

  it('compara ObjectId y string', () => {
    const oid = { toString: () => 'abc123' };
    expect(agentToolsAccess({ userId: oid }, 'abc123', false)).toBe('owner');
  });
});

describe('checkWidgetPublicRateLimit', () => {
  const req = { headers: { get: () => null } };
  beforeEach(() => rate.mockReset());

  it('pasa si ambos cubos tienen cupo', async () => {
    rate.mockResolvedValue({ success: true, retryAfter: 0 });
    await expect(checkWidgetPublicRateLimit(req, 'ticket', 'w1')).resolves.toEqual({ ok: true });
    expect(rate).toHaveBeenCalledWith('widget-ticket-ip', 'w1:9.9.9.9', WIDGET_PUBLIC_LIMITS.ticket.perIp, 600_000);
    expect(rate).toHaveBeenCalledWith('widget-ticket-widget', 'w1', WIDGET_PUBLIC_LIMITS.ticket.perWidgetHour, 3_600_000);
  });

  it('corta por IP', async () => {
    rate.mockResolvedValueOnce({ success: false, retryAfter: 42 });
    await expect(checkWidgetPublicRateLimit(req, 'handoff', 'w1')).resolves.toEqual({ ok: false, retryAfter: 42 });
    expect(rate).toHaveBeenCalledTimes(1);
  });

  it('corta por widget aunque cada IP sea distinta', async () => {
    rate.mockResolvedValueOnce({ success: true, retryAfter: 0 }).mockResolvedValueOnce({ success: false, retryAfter: 7 });
    await expect(checkWidgetPublicRateLimit(req, 'support-contact', 'w1')).resolves.toEqual({ ok: false, retryAfter: 7 });
  });

  it('support-contact es el más estricto (manda un email por petición)', () => {
    expect(WIDGET_PUBLIC_LIMITS['support-contact'].perIp).toBeLessThan(WIDGET_PUBLIC_LIMITS.ticket.perIp);
  });
});

describe('POST /api/agents/[id]/ab-tests/metrics', () => {
  const params = { params: Promise.resolve({ id: 'agent1' }) };
  const mk = (headers: Record<string, string>) =>
    new NextRequest('http://localhost/api/agents/agent1/ab-tests/metrics', {
      method: 'POST',
      body: JSON.stringify({ variantId: 'v1' }),
      headers: { 'content-type': 'application/json', ...headers },
    });

  beforeEach(() => {
    record.mockReset().mockResolvedValue({ ok: true });
    process.env.HUB_TO_LANDING_SECRET = 'secreto-interno-de-prueba';
  });

  it('sin secreto interno: 401 y no toca las métricas (antes era público)', async () => {
    const res = await abMetricsPost(mk({}), params);
    expect(res.status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });

  it('con secreto equivocado: 401', async () => {
    const res = await abMetricsPost(mk({ 'x-internal-secret': 'otro' }), params);
    expect(res.status).toBe(401);
  });

  it('sin HUB_TO_LANDING_SECRET configurado: 401', async () => {
    delete process.env.HUB_TO_LANDING_SECRET;
    const res = await abMetricsPost(mk({ 'x-internal-secret': '' }), params);
    expect(res.status).toBe(401);
  });

  it('con el secreto interno registra la variante', async () => {
    const res = await abMetricsPost(mk({ 'x-internal-secret': 'secreto-interno-de-prueba' }), params);
    expect(res.status).toBe(200);
    expect(record).toHaveBeenCalledWith('agent1', { variantId: 'v1' });
  });
});

describe('verifySessionToken caduca', () => {
  it('acepta un token reciente y rechaza uno de más de 12 h o del futuro', async () => {
    process.env.JWT_SECRET = 'x'.repeat(40);
    const { createSessionToken, verifySessionToken, SESSION_MAX_AGE_MS } = await import('@/lib/auth');
    const realNow = Date.now;
    try {
      const t0 = 1_800_000_000_000;
      Date.now = () => t0;
      const tok = createSessionToken('user_1');
      expect(verifySessionToken(tok)).toBe('user_1');
      Date.now = () => t0 + SESSION_MAX_AGE_MS - 1000;
      expect(verifySessionToken(tok)).toBe('user_1');
      Date.now = () => t0 + SESSION_MAX_AGE_MS + 1000;
      expect(verifySessionToken(tok)).toBeNull();
      Date.now = () => t0 - 60 * 60 * 1000;
      expect(verifySessionToken(tok)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});
