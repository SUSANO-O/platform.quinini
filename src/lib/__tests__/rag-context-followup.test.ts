import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Fase 2: la landing manda la conversación al buscar en documentos para que el hub entienda el seguimiento. */
const { mockHubFetch } = vi.hoisted(() => ({ mockHubFetch: vi.fn() }));
vi.mock('@/lib/aibackhub-sync', async (orig) => ({
  ...(await orig<typeof import('@/lib/aibackhub-sync')>()),
  getAibackhubBaseUrl: () => 'https://hub.test',
  hubFetch: mockHubFetch,
}));

import { RAG_HISTORY_TURNS, retrieveRagContextBlock } from '@/lib/rag-embeddings-index';

function sentBody(): Record<string, unknown> {
  return JSON.parse(String((mockHubFetch.mock.calls[0][1] as RequestInit).body)) as Record<string, unknown>;
}

beforeEach(() => {
  mockHubFetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ data: { context: 'ctx' } }), { status: 200 }));
});

describe('retrieveRagContextBlock — historial', () => {
  it('envía los últimos turnos de la conversación', async () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', content: `t${i}` }));
    expect(await retrieveRagContextBlock({ agentHubId: 'hub-1', query: '¿y eso?', history })).toBe('ctx');
    const body = sentBody();
    expect(body.query).toBe('¿y eso?');
    expect((body.history as Array<{ content: string }>).map((t) => t.content)).toEqual(history.slice(-RAG_HISTORY_TURNS).map((t) => t.content));
  });

  it('sin historial no lo manda (comportamiento de siempre)', async () => {
    await retrieveRagContextBlock({ agentHubId: 'hub-1', query: '¿cómo creo una geocerca?' });
    expect(sentBody().history).toBeUndefined();
  });
});

import { RAG_TOP_K } from '@/lib/rag-embeddings-index';

describe('retrieveRagContextBlock — fragmentos', () => {
  it('pide los mismos 8 fragmentos que el chat con herramientas del backend', async () => {
    await retrieveRagContextBlock({ agentHubId: 'hub-1', query: '¿cómo creo una geocerca?' });
    expect(RAG_TOP_K).toBe(8);
    expect(sentBody().topK).toBe(8);
  });
});
