import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Streaming real: el hub manda `token` (trozos ya saneados) y `token_reset` (texto provisional
 * descartado) antes de `done`. La landing los reenvía en vivo y sigue resolviendo con `done`.
 */
const { mockConnectDB, mockFindOne, mockGetBase, mockHeaders, mockSyncCatalog } = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockFindOne: vi.fn(),
  mockGetBase: vi.fn(),
  mockHeaders: vi.fn(),
  mockSyncCatalog: vi.fn(),
}));

vi.mock('@/lib/db/connection', () => ({ connectDB: mockConnectDB }));
vi.mock('@/lib/db/models', () => ({ ClientAgent: { findOne: mockFindOne } }));
vi.mock('@/lib/aibackhub-sync', () => ({
  getAibackhubBaseUrl: mockGetBase,
  hubCreateHeaders: mockHeaders,
  syncHubCatalogFromLandingAgentDoc: mockSyncCatalog,
}));

import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';

function sse(events: unknown[]): Response {
  const raw = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(ctl) {
        // Trozos de red arbitrarios: los eventos llegan partidos.
        for (let i = 0; i < raw.length; i += 11) ctl.enqueue(enc.encode(raw.slice(i, i + 11)));
        ctl.close();
      },
    }),
    { status: 200 },
  );
}

beforeEach(() => {
  mockGetBase.mockReturnValue('http://hub.test');
  mockHeaders.mockReturnValue({});
  mockSyncCatalog.mockResolvedValue(undefined);
  mockFindOne.mockReturnValue({
    lean: vi.fn().mockResolvedValue({
      _id: 'agent_1',
      agentHubId: '',
      model: 'vx/gemini-3.8-flash',
      systemPrompt: 'Eres un asistente.',
      tools: [],
      enabledMcpToolIds: ['mcp:googleCalendar:calendar_list_events'],
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('tryServeWidgetChatViaHubMcp — tokens en vivo', () => {
  it('reenvía token y token_reset en orden y resuelve con la respuesta final de done', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse([
          { type: 'status', phase: 'model', message: 'Pensando…' },
          { type: 'token', text: 'Voy a revisar ' },
          { type: 'token_reset' },
          { type: 'token', text: 'Tienes dos ' },
          { type: 'token', text: 'clases mañana.' },
          { type: 'done', reply: 'Tienes dos clases mañana.', toolsUsed: ['mcp:googleCalendar:calendar_list_events'] },
        ]),
      ),
    );
    const seen: string[] = [];
    const result = await tryServeWidgetChatViaHubMcp({
      widgetTokenStartsWithWt: true,
      parsedAgentId: 'agent_1',
      rawBody: JSON.stringify({ message: '¿Qué tengo mañana?', history: [] }),
      ownerUserId: 'user_1',
      onStatus: () => seen.push('status'),
      onToken: (d) => seen.push(`+${d}`),
      onTokenReset: () => seen.push('reset'),
    });
    expect(seen).toEqual(['status', '+Voy a revisar ', 'reset', '+Tienes dos ', '+clases mañana.']);
    expect(result?.reply).toBe('Tienes dos clases mañana.');
    expect(result?.toolsUsed).toEqual(['mcp:googleCalendar:calendar_list_events']);
  });

  it('un hub antiguo sin eventos token sigue funcionando igual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([{ type: 'done', reply: 'Hola.' }])));
    const onToken = vi.fn();
    const result = await tryServeWidgetChatViaHubMcp({
      widgetTokenStartsWithWt: true,
      parsedAgentId: 'agent_1',
      rawBody: JSON.stringify({ message: '¿Qué eventos tengo esta semana?', history: [] }),
      ownerUserId: 'user_1',
      onStatus: () => {},
      onToken,
    });
    expect(onToken).not.toHaveBeenCalled();
    expect(result?.reply).toBe('Hola.');
  });
});
