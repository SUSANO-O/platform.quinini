import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Inferencia directa:
 *  1. Documentos con la misma regla que el chat con herramientas del backend: con los documentos
 *     activados se busca siempre (antes solo con vocabulario comercial, así que una pregunta técnica
 *     de Navi App se respondía sin mirarlos mientras su MySQL estaba caído).
 *  2. Habilidades, memoria y documentos se preparan en paralelo (antes, en fila).
 */
const { mockFindOne, mockHubFetch, mockRag, mockRecall } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockHubFetch: vi.fn(),
  mockRag: vi.fn(),
  mockRecall: vi.fn(),
}));

vi.mock('@/lib/db/connection', () => ({ connectDB: vi.fn() }));
vi.mock('@/lib/db/models', () => ({ ClientAgent: { findOne: mockFindOne } }));
vi.mock('@/lib/aibackhub-sync', () => ({
  getAibackhubBaseUrl: () => 'https://hub.test',
  hubCreateHeaders: () => ({}),
  hubFetch: mockHubFetch,
  syncHubCatalogFromLandingAgentDoc: vi.fn(),
}));
vi.mock('@/lib/rag-embeddings-index', () => ({ retrieveRagContextBlock: mockRag }));
vi.mock('@/lib/widget-conversation-recall', async (orig) => ({
  ...(await orig<typeof import('@/lib/widget-conversation-recall')>()),
  shouldRecallConversationMemory: () => true,
  recallConversationContextBlock: mockRecall,
}));

import { tryServeWidgetChatViaDirectInference } from '@/lib/widget-chat-direct-inference';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AGENT = {
  _id: 'agent_1',
  agentHubId: 'hub-tribu',
  name: 'tribu app',
  model: 'vx/gemini-2.5-flash',
  systemPrompt: 'Eres Navi.',
  tools: [],
  ragEnabled: true,
  skills: ['tech_support_l1'],
};

function body(message: string) {
  return JSON.stringify({ message, history: [], sessionId: 's1', visitorId: 'v1' });
}

function modelsPrompt(): string {
  const call = mockHubFetch.mock.calls.find(([p]) => p === '/api/models');
  return String((JSON.parse((call?.[1] as RequestInit).body as string) as { prompt: string }).prompt);
}

beforeEach(() => {
  mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(AGENT) });
  mockRag.mockResolvedValue('[DOC] La batería dura 7 días en modo ahorro.');
  mockRecall.mockResolvedValue('');
  mockHubFetch.mockImplementation(async (path: string) => {
    if (path === '/api/agents/resolve-skill-context') {
      return new Response(JSON.stringify({ data: { systemPrompt: 'Eres Navi. Soporte L1.' } }), { status: 200 });
    }
    return new Response(JSON.stringify({ text: 'La batería dura 7 días.' }), { status: 200 });
  });
});
afterEach(() => vi.clearAllMocks());

describe('inferencia directa — documentos', () => {
  it('pregunta técnica (sin vocabulario comercial) con documentos activados: los busca y van al modelo', async () => {
    const res = await tryServeWidgetChatViaDirectInference({
      parsedAgentId: 'agent_1',
      rawBody: body('¿Cuánto dura la batería del rastreador?'),
      ownerUserId: 'u1',
      allowWithoutMcp: true,
    });
    expect(res?.reply).toBe('La batería dura 7 días.');
    expect(mockRag).toHaveBeenCalledWith(expect.objectContaining({ agentHubId: 'hub-tribu', query: '¿Cuánto dura la batería del rastreador?' }));
    expect(modelsPrompt()).toContain('La batería dura 7 días en modo ahorro.');
  });

  it('con documentos desactivados y sin vocabulario comercial no busca', async () => {
    mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...AGENT, ragEnabled: false }) });
    await tryServeWidgetChatViaDirectInference({
      parsedAgentId: 'agent_1',
      rawBody: body('¿Cuánto dura la batería del rastreador?'),
      ownerUserId: 'u1',
      allowWithoutMcp: true,
    });
    expect(mockRag).not.toHaveBeenCalled();
  });

  it('un saludo no busca documentos', async () => {
    await tryServeWidgetChatViaDirectInference({ parsedAgentId: 'agent_1', rawBody: body('hola'), ownerUserId: 'u1', allowWithoutMcp: true });
    expect(mockRag).not.toHaveBeenCalled();
  });

  it('si la búsqueda falla, responde igual sin documentos', async () => {
    mockRag.mockRejectedValue(new Error('pinecone caído'));
    const res = await tryServeWidgetChatViaDirectInference({
      parsedAgentId: 'agent_1',
      rawBody: body('¿Cuánto dura la batería del rastreador?'),
      ownerUserId: 'u1',
      allowWithoutMcp: true,
    });
    expect(res?.reply).toBe('La batería dura 7 días.');
  });
});

describe('inferencia directa — preparación en paralelo', () => {
  it('habilidades, memoria y documentos se esperan a la vez, y el contexto conserva su orden', async () => {
    const STEP = 120;
    mockRecall.mockImplementation(async () => {
      await sleep(STEP);
      return '[MEMORIA] El cliente tiene 2 vehículos.';
    });
    mockRag.mockImplementation(async () => {
      await sleep(STEP);
      return '[DOC] La batería dura 7 días en modo ahorro.';
    });
    mockHubFetch.mockImplementation(async (path: string) => {
      if (path === '/api/agents/resolve-skill-context') {
        await sleep(STEP);
        return new Response(JSON.stringify({ data: { systemPrompt: 'Eres Navi. Soporte L1.' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
    });

    const t0 = Date.now();
    await tryServeWidgetChatViaDirectInference({
      parsedAgentId: 'agent_1',
      rawBody: body('¿Cuánto dura la batería del rastreador?'),
      ownerUserId: 'u1',
      allowWithoutMcp: true,
    });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(STEP * 2); // en fila serían ≥ 3 × STEP
    const prompt = modelsPrompt();
    expect(prompt.indexOf('[MEMORIA]')).toBeGreaterThanOrEqual(0);
    expect(prompt.indexOf('[MEMORIA]')).toBeLessThan(prompt.indexOf('[DOC]'));
  });
});
