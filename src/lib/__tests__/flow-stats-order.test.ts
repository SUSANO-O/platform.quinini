import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findOne, updateOne } = vi.hoisted(() => ({ findOne: vi.fn(), updateOne: vi.fn() }));
vi.mock('@/lib/db/models', () => ({ FlowConversation: { findOne, updateOne, create: vi.fn() } }));

import { upsertFlowConversation } from '@/lib/flow-stats';

beforeEach(() => {
  findOne.mockReset();
  updateOne.mockReset().mockResolvedValue({});
});

describe('upsertFlowConversation — registros en desorden', () => {
  it('un "active" que llega tarde no reabre una conversación completada', async () => {
    findOne.mockReturnValue({ lean: async () => ({ status: 'completed', startedAt: new Date(Date.now() - 5000), endedAt: new Date() }) });
    await upsertFlowConversation({ flowId: 'f', userId: 'u', sessionId: 's', status: 'active' });
    expect(updateOne.mock.calls[0][1].$set.status).toBe('completed');
    expect(updateOne.mock.calls[0][1].$set.endedAt).toBeInstanceOf(Date);
  });

  it('busca la sesión dentro del mismo flujo', async () => {
    findOne.mockReturnValue({ lean: async () => ({ status: 'active', startedAt: new Date() }) });
    await upsertFlowConversation({ flowId: 'f', userId: 'u', sessionId: 's', status: 'completed' });
    expect(findOne).toHaveBeenCalledWith({ sessionId: 's', flowId: 'f' });
    expect(updateOne.mock.calls[0][1].$set.status).toBe('completed');
  });
});
