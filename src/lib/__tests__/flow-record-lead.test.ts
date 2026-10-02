import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findOne, upsert, captureOnce, send } = vi.hoisted(() => ({
  findOne: vi.fn(),
  upsert: vi.fn(),
  captureOnce: vi.fn(),
  send: vi.fn(),
}));
vi.mock('@/lib/db/connection', () => ({ connectDB: async () => undefined }));
vi.mock('@/lib/db/models', () => ({ ConversationFlow: { findOne: (...a: unknown[]) => findOne(...a) } }));
vi.mock('@/lib/flow-access', () => ({
  resolveFlowAccessForUser: async () => ({ hasAccess: true }),
  flowAccessDeniedMessage: () => 'plan',
}));
vi.mock('@/lib/flow-stats', () => ({ upsertFlowConversation: upsert, captureFlowLeadOnce: captureOnce }));
vi.mock('@/lib/saas-webhook-outbound', () => ({ sendSaasWebhook: send }));

import { POST } from '@/app/api/flows/[id]/conversations/record/route';

const FLOW = {
  _id: 'f1',
  userId: 'u1',
  name: 'Cotización',
  status: 'published',
  generatesLeads: true,
  nodes: [
    { id: 'n1', type: 'text', question: '¿Tu nombre?' },
    { id: 'n2', type: 'email', question: '¿Tu correo?' },
  ],
};
const ANSWERS = [
  { nodeId: 'n1', key: 'n1', value: 'Ana' },
  { nodeId: 'n2', key: 'n2', value: 'ana@x.co' },
];
const ctx = { params: Promise.resolve({ id: 'f1' }) };
const req = (body: unknown) =>
  new NextRequest('http://x/api/flows/f1/conversations/record', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-flow-token': 'tok' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  findOne.mockReset().mockReturnValue({ lean: async () => FLOW });
  upsert.mockReset().mockResolvedValue(undefined);
  captureOnce.mockReset().mockResolvedValue(true);
  send.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/flows/[id]/conversations/record — leads', () => {
  it('al completar: guarda el lead una vez y lo envía por webhook con el origen (ruta + utm)', async () => {
    const res = await POST(
      req({ sessionId: 's1', status: 'completed', answers: ANSWERS, pageUrl: 'https://a.com/precios?utm_source=fb&email=ana@x.co' }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(captureOnce).toHaveBeenCalledWith({
      flowId: 'f1',
      sessionId: 's1',
      lead: expect.objectContaining({ name: 'Ana', email: 'ana@x.co' }),
    });
    expect(send).toHaveBeenCalledWith('u1', 'flow.lead_captured', expect.objectContaining({
      flowName: 'Cotización',
      source: { pagePath: '/precios', utm: { utm_source: 'fb' } },
    }));
  });

  it('ya capturado (reintento) → no reenvía el webhook', async () => {
    captureOnce.mockResolvedValue(false);
    await POST(req({ sessionId: 's1', status: 'completed', answers: ANSWERS }), ctx);
    expect(send).not.toHaveBeenCalled();
  });

  it('flujo sin "genera leads" o aún activo → ni lead ni webhook', async () => {
    findOne.mockReturnValue({ lean: async () => ({ ...FLOW, generatesLeads: false }) });
    await POST(req({ sessionId: 's1', status: 'completed', answers: ANSWERS }), ctx);
    findOne.mockReturnValue({ lean: async () => FLOW });
    await POST(req({ sessionId: 's1', status: 'active', answers: ANSWERS }), ctx);
    expect(captureOnce).not.toHaveBeenCalled();
  });

  it('pasar al agente también cierra el lead; status raro se trata como active', async () => {
    await POST(req({ sessionId: 's2', status: 'hackeado', answers: ANSWERS, handedOffTo: 'a'.repeat(24) }), ctx);
    expect(upsert.mock.calls[0][0].status).toBe('active');
    expect(captureOnce).toHaveBeenCalled();
  });
});
