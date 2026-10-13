import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mocks hoisted (necesarios porque vi.mock se eleva por encima de los imports):
 * - DB: connectDB no-op, ClientAgent.findOne(...).lean() controlado por test.
 * - aibackhub-sync: base URL / headers / sync de catálogo, sin red real.
 * El resto de las dependencias (agent-webhooks, agent-sheets, agent-skills-mcp,
 * widget-mcp-turn-gate, widget-chat-vision-context) son funciones puras — se usan
 * reales, ya cubiertas por sus propias suites (fases 1 y 2).
 */
const { mockConnectDB, mockFindOne, mockGetBase, mockHeaders, mockSyncCatalog } = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockFindOne: vi.fn(),
  mockGetBase: vi.fn(),
  mockHeaders: vi.fn(),
  mockSyncCatalog: vi.fn(),
}));

vi.mock('@/lib/db/connection', () => ({
  connectDB: mockConnectDB,
}));

vi.mock('@/lib/db/models', () => ({
  ClientAgent: { findOne: mockFindOne },
}));

vi.mock('@/lib/aibackhub-sync', () => ({
  getAibackhubBaseUrl: mockGetBase,
  hubCreateHeaders: mockHeaders,
  syncHubCatalogFromLandingAgentDoc: mockSyncCatalog,
}));

import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';

type Params = Parameters<typeof tryServeWidgetChatViaHubMcp>[0];

// ── Helpers ──────────────────────────────────────────────────────────────

function baseParams(overrides: Partial<Params> = {}): Params {
  return {
    widgetTokenStartsWithWt: true,
    parsedAgentId: 'agent_1',
    rawBody: JSON.stringify({ message: 'Hola, necesito ayuda con mi pedido', history: [] }),
    ownerUserId: 'user_1',
    ...overrides,
  };
}

function baseAgentDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'agent_1',
    agentHubId: '',
    model: 'gemini-2.5-flash',
    systemPrompt: 'Sos un asistente de ventas.',
    tools: [{ toolId: 'webhook', config: { url: 'https://example.com/hook' } }],
    enabledMcpToolIds: [],
    hubspotAutoCaptureContacts: false,
    ...overrides,
  };
}

function setAgentDoc(doc: Record<string, unknown> | null) {
  mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) });
}

type FetchCall = { url: string; payload: Record<string, unknown> | undefined };

function mockFetchCapture(
  responseFactory: (payload: Record<string, unknown> | undefined, url: string) => unknown,
): { fn: ReturnType<typeof vi.fn>; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const payload = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
    calls.push({ url, payload });
    return responseFactory(payload, url);
  });
  return { fn, calls };
}

function okNonStreamingResponse(data: Record<string, unknown>) {
  return { ok: true, text: async () => JSON.stringify({ success: true, data }) };
}

function httpErrorResponse(status: number, body = 'boom') {
  return { ok: false, status, text: async () => body };
}

function nonJsonResponse(raw: string) {
  return { ok: true, text: async () => raw };
}

/** Simula res.body como SSE de un solo chunk con los eventos ya formateados `data: {...}\n\n`. */
function sseResponse(rawEvents: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(rawEvents);
  let sent = false;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          read: async () => {
            if (!sent) {
              sent = true;
              return { done: false, value: bytes };
            }
            return { done: true, value: undefined };
          },
        };
      },
    },
    text: async () => '',
  };
}

function sseEvents(events: Array<Record<string, unknown>>): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
}

// ── Tokens reales del motor (Fase 4 latencia) ──────────────────────────
// El motor ahora devuelve `usage` (suma de tokens de todas las llamadas al modelo del turno);
// la landing lo pasa a InferenceMetric. Un motor viejo sin `usage` sigue funcionando.

const USAGE = { model: 'gemini-3.5-flash', provider: 'vertex', inputTokens: 2700, outputTokens: 220, calls: 2 };

describe('tryServeWidgetChatViaHubMcp — usage del motor', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockConnectDB.mockReset().mockResolvedValue(undefined);
    mockGetBase.mockReset().mockReturnValue('http://hub.test');
    mockHeaders.mockReset().mockReturnValue({ 'Content-Type': 'application/json' });
    mockSyncCatalog.mockReset().mockResolvedValue(true);
    mockFindOne.mockReset();
    setAgentDoc(baseAgentDoc());
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('JSON: devuelve usage del motor', async () => {
    global.fetch = mockFetchCapture(() => okNonStreamingResponse({ text: 'Hola', usage: USAGE })).fn as unknown as typeof fetch;
    const out = await tryServeWidgetChatViaHubMcp(baseParams());
    expect(out?.usage).toEqual({ model: 'gemini-3.5-flash', provider: 'vertex', inputTokens: 2700, outputTokens: 220 });
  });

  it('SSE: devuelve usage del evento done', async () => {
    global.fetch = mockFetchCapture(() =>
      sseResponse(sseEvents([{ type: 'done', reply: 'Hola', toolsUsed: [], toolRounds: 0, usage: USAGE }])),
    ).fn as unknown as typeof fetch;
    const out = await tryServeWidgetChatViaHubMcp(baseParams({ onStatus: () => {} }));
    expect(out?.reply).toBe('Hola');
    expect(out?.usage?.inputTokens).toBe(2700);
  });

  it('motor viejo sin usage o usage malformado → undefined (se estima como antes)', async () => {
    global.fetch = mockFetchCapture(() => okNonStreamingResponse({ text: 'Hola' })).fn as unknown as typeof fetch;
    expect((await tryServeWidgetChatViaHubMcp(baseParams()))?.usage).toBeUndefined();
    global.fetch = mockFetchCapture(() =>
      okNonStreamingResponse({ text: 'Hola', usage: { inputTokens: 'mucho', outputTokens: -1 } }),
    ).fn as unknown as typeof fetch;
    expect((await tryServeWidgetChatViaHubMcp(baseParams()))?.usage).toBeUndefined();
  });
});
