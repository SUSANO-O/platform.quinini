import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Inferencia directa con streaming real: el visitante ve el texto al primer token en vez de esperar
 * la respuesta entera. Si el hub aún no tiene /api/models/stream, se usa el POST de siempre.
 */
const { mockConnectDB, mockFindOne, mockGetBase, mockHeaders, mockHubFetch } = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockFindOne: vi.fn(),
  mockGetBase: vi.fn(),
  mockHeaders: vi.fn(),
  mockHubFetch: vi.fn(),
}));

vi.mock('@/lib/db/connection', () => ({ connectDB: mockConnectDB }));
vi.mock('@/lib/db/models', () => ({ ClientAgent: { findOne: mockFindOne } }));
vi.mock('@/lib/aibackhub-sync', () => ({
  getAibackhubBaseUrl: mockGetBase,
  hubCreateHeaders: mockHeaders,
  hubFetch: mockHubFetch,
  syncHubCatalogFromLandingAgentDoc: vi.fn(),
}));

import { tryServeWidgetChatViaDirectInference } from '@/lib/widget-chat-direct-inference';
import { createInferTokenRelay } from '@/lib/widget-infer-token-relay';

const AGENT = { _id: 'agent_1', agentHubId: '', model: 'vx/gemini-2.5-flash', systemPrompt: 'Eres Navi.', tools: [] };
const BODY = JSON.stringify({ message: '¿Dónde veo el recorrido de ayer de mi vehículo?', history: [] });

function sse(events: Record<string, unknown>[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function paths(): string[] {
  return mockHubFetch.mock.calls.map(([p]) => p as string);
}

beforeEach(() => {
  mockGetBase.mockReturnValue('https://hub.test');
  mockHeaders.mockReturnValue({});
  mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(AGENT) });
});
afterEach(() => vi.clearAllMocks());

describe('tryServeWidgetChatViaDirectInference — streaming', () => {
  it('reenvía los tokens según llegan y devuelve la respuesta final del done', async () => {
    mockHubFetch.mockImplementation(async (path: string) =>
      path === '/api/models/stream'
        ? sse([
            { type: 'token', text: 'Entra a Reportes ' },
            { type: 'token', text: '→ Rutas. ' },
            { type: 'done', reply: 'Entra a Reportes → Rutas.', modelUsed: 'gemini-2.5-flash' },
          ])
        : new Response('{}', { status: 500 }),
    );
    const tokens: string[] = [];
    const res = await tryServeWidgetChatViaDirectInference({
      parsedAgentId: 'agent_1',
      rawBody: BODY,
      ownerUserId: 'u1',
      onToken: (t) => tokens.push(t),
    });
    expect(tokens).toEqual(['Entra a Reportes ', '→ Rutas. ']);
    expect(res?.reply).toBe('Entra a Reportes → Rutas.');
    expect(res?.usedModel).toBe('gemini-2.5-flash');
    expect(paths()).not.toContain('/api/models');
  });

  it('el stream lleva el mismo cuerpo y cabeceras que el POST normal (saneado incluido)', async () => {
    mockHubFetch.mockResolvedValueOnce(sse([{ type: 'done', reply: 'ok' }]));
    await tryServeWidgetChatViaDirectInference({ parsedAgentId: 'agent_1', rawBody: BODY, ownerUserId: 'u1', onToken: () => {} });
    const [path, init] = mockHubFetch.mock.calls.at(-1)! as [string, RequestInit];
    expect(path).toBe('/api/models/stream');
    expect((init.headers as Record<string, string>)['x-widget-output-sanitize']).toBe('true');
    expect(JSON.parse(init.body as string)).toMatchObject({ provider: 'vertex', model: 'gemini-2.5-flash', taskType: 'chat' });
  });

  it('hub sin /api/models/stream (404): usa el POST de siempre sin emitir nada', async () => {
    mockHubFetch.mockImplementation(async (path: string) =>
      path === '/api/models/stream'
        ? new Response('Not found', { status: 404 })
        : new Response(JSON.stringify({ text: 'respuesta normal' }), { status: 200 }),
    );
    const tokens: string[] = [];
    const res = await tryServeWidgetChatViaDirectInference({ parsedAgentId: 'agent_1', rawBody: BODY, ownerUserId: 'u1', onToken: (t) => tokens.push(t) });
    expect(res?.reply).toBe('respuesta normal');
    expect(tokens).toEqual([]);
    expect(paths()).toEqual(['/api/models/stream', '/api/models']);
  });

  it('si el stream falla tras emitir texto, lo borra y devuelve null (el que llama sigue por otro camino)', async () => {
    mockHubFetch.mockResolvedValueOnce(sse([{ type: 'token', text: 'Entra a ' }, { type: 'error', message: 'MODEL_STREAM_FAILED' }]));
    const onTokenReset = vi.fn();
    const res = await tryServeWidgetChatViaDirectInference({
      parsedAgentId: 'agent_1',
      rawBody: BODY,
      ownerUserId: 'u1',
      onToken: () => {},
      onTokenReset,
    });
    expect(res).toBeNull();
    expect(onTokenReset).toHaveBeenCalledOnce();
  });

  it('sin onToken no toca el stream (comportamiento de siempre)', async () => {
    mockHubFetch.mockResolvedValue(new Response(JSON.stringify({ text: 'hola' }), { status: 200 }));
    const res = await tryServeWidgetChatViaDirectInference({ parsedAgentId: 'agent_1', rawBody: BODY, ownerUserId: 'u1' });
    expect(res?.reply).toBe('hola');
    expect(paths()).toEqual(['/api/models']);
  });
});

describe('createInferTokenRelay', () => {
  it('reenvía tokens, marca el primer token una vez y sabe si ya hay texto en pantalla', () => {
    const sent: Record<string, unknown>[] = [];
    const trace = { mark: vi.fn() };
    const relay = createInferTokenRelay((d) => sent.push(d), trace);
    expect(relay.streamed()).toBe(false);
    relay.onToken('Hola ');
    relay.onToken('mundo');
    expect(trace.mark).toHaveBeenCalledOnce();
    expect(trace.mark).toHaveBeenCalledWith('infer_direct_first_token');
    expect(relay.streamed()).toBe(true);
    relay.clear();
    expect(sent).toEqual([{ type: 'token', text: 'Hola ' }, { type: 'token', text: 'mundo' }, { type: 'token_reset' }]);
    expect(relay.streamed()).toBe(false);
    relay.clear();
    expect(sent).toHaveLength(3);
  });
});
