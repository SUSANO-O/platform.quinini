import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { userFind, subFind, outboxCreate } = vi.hoisted(() => ({ userFind: vi.fn(), subFind: vi.fn(), outboxCreate: vi.fn() }));
vi.mock('@/lib/db/connection', () => ({ connectDB: async () => undefined }));
vi.mock('@/lib/plan-catalog', () => ({ canUseOutboundSaasWebhook: () => true }));
vi.mock('@/lib/db/models', () => ({
  User: { findById: userFind },
  Subscription: { findOne: subFind },
  WebhookOutbox: { create: outboxCreate },
}));

import { __setSaasRetryDelaysForTests, sendSaasWebhook } from '@/lib/saas-webhook-outbound';

const lean = (v: unknown) => ({ select: () => ({ lean: async () => v }) });
const fetchMock = vi.fn();

beforeEach(() => {
  __setSaasRetryDelaysForTests([0, 0, 0]);
  userFind.mockReset().mockReturnValue(lean({ saasWebhookUrl: 'https://crm.ejemplo.co/hook', saasWebhookSecret: 's3cr3t' }));
  subFind.mockReset().mockReturnValue(lean({ plan: 'business', status: 'active' }));
  outboxCreate.mockReset().mockResolvedValue({});
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

const res = (status: number) => ({ ok: status < 400, status });

describe('sendSaasWebhook — leads con reintento diferido', () => {
  it('lead: entrega OK a la primera → no encola; lleva Idempotency-Key = deliveryId', async () => {
    fetchMock.mockResolvedValue(res(200));
    await sendSaasWebhook('u1', 'flow.lead_captured', { lead: { email: 'a@b.co' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.deliveryId).toMatch(/^dlv_/);
    expect(init.headers['Idempotency-Key']).toBe(body.deliveryId);
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it('lead: 429 en los 3 intentos → al outbox, sin el secreto, con el mismo payload', async () => {
    fetchMock.mockResolvedValue(res(429));
    await sendSaasWebhook('u1', 'flow.lead_captured', { lead: { email: 'a@b.co' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const doc = outboxCreate.mock.calls[0][0];
    expect(doc).toMatchObject({ tenantId: 'u1', agentId: '', webhookName: 'saas', event: 'flow.lead_captured', url: 'https://crm.ejemplo.co/hook', status: 'pending', lastStatus: 429 });
    expect(JSON.stringify(doc)).not.toContain('s3cr3t');
    expect(doc.payload.deliveryId).toBe(JSON.parse(fetchMock.mock.calls[0][1].body).deliveryId);
  });

  it('lead: error de red → al outbox', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    await sendSaasWebhook('u1', 'flow.lead_captured', {});
    expect(outboxCreate.mock.calls[0][0]).toMatchObject({ lastStatus: 0, lastError: 'ECONNRESET' });
  });

  it('lead: 404 (permanente) → no reintenta ni encola', async () => {
    fetchMock.mockResolvedValue(res(404));
    await sendSaasWebhook('u1', 'flow.lead_captured', {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it('otros eventos (p. ej. cuota) no usan el outbox ni deliveryId', async () => {
    fetchMock.mockResolvedValue(res(503));
    await sendSaasWebhook('u1', 'quota.warning', {});
    expect(outboxCreate).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).deliveryId).toBeUndefined();
  });
});
