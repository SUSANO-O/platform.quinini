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

function okNonStreamingResponse(data: { text: string; toolsUsed?: string[]; toolRounds?: number }) {
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

// ── Setup ────────────────────────────────────────────────────────────────

describe('tryServeWidgetChatViaHubMcp', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockConnectDB.mockReset().mockResolvedValue(undefined);
    mockGetBase.mockReset().mockReturnValue('http://hub.test');
    mockHeaders.mockReset().mockReturnValue({ 'Content-Type': 'application/json' });
    mockSyncCatalog.mockReset().mockResolvedValue(true);
    mockFindOne.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ── Validación de inputs ────────────────────────────────────────────

  describe('validación de inputs', () => {
    it('sin widgetTokenStartsWithWt corta antes de tocar DB o red', async () => {
      const result = await tryServeWidgetChatViaHubMcp(baseParams({ widgetTokenStartsWithWt: false }));
      expect(result).toBeNull();
      expect(mockConnectDB).not.toHaveBeenCalled();
      expect(mockGetBase).not.toHaveBeenCalled();
    });

    it('con parsedAgentId vacío/whitespace corta antes de tocar DB o red', async () => {
      const result = await tryServeWidgetChatViaHubMcp(baseParams({ parsedAgentId: '   ' }));
      expect(result).toBeNull();
      expect(mockConnectDB).not.toHaveBeenCalled();
    });

    it('sin BACKEND_URL configurado (hubBase vacío) corta antes de conectar a DB', async () => {
      mockGetBase.mockReturnValue('');
      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).toBeNull();
      expect(mockConnectDB).not.toHaveBeenCalled();
    });

    it('rawBody no es JSON válido devuelve null sin tocar DB', async () => {
      const result = await tryServeWidgetChatViaHubMcp(baseParams({ rawBody: '{not-json' }));
      expect(result).toBeNull();
      expect(mockConnectDB).not.toHaveBeenCalled();
    });

    it('message vacío o solo espacios devuelve null sin tocar DB', async () => {
      const result = await tryServeWidgetChatViaHubMcp(
        baseParams({ rawBody: JSON.stringify({ message: '   ' }) }),
      );
      expect(result).toBeNull();
      expect(mockConnectDB).not.toHaveBeenCalled();
    });
  });

  // ── Elegibilidad ─────────────────────────────────────────────────────

  describe('elegibilidad', () => {
    it('agente con webhook configurado es elegible y llama al hub', async () => {
      setAgentDoc(baseAgentDoc());
      const { fn, calls } = mockFetchCapture(() => okNonStreamingResponse({ text: 'Respuesta con webhook' }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());

      expect(result).toEqual({ reply: 'Respuesta con webhook', toolsUsed: undefined, toolRounds: undefined });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(calls[0]?.url).toBe('http://hub.test/api/mcp/widget-chat');
    });

    it('agente sin webhook/HubSpot/skills-MCP/tools explícitas NO es elegible: no llama al hub', async () => {
      setAgentDoc(baseAgentDoc({ tools: [], hubspotAutoCaptureContacts: false, enabledMcpToolIds: [] }));
      const { fn } = mockFetchCapture(() => okNonStreamingResponse({ text: 'no debería llegar' }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());

      expect(result).toBeNull();
      expect(fn).not.toHaveBeenCalled();
    });

    it('agente no encontrado en Mongo NO es elegible', async () => {
      setAgentDoc(null);
      const { fn } = mockFetchCapture(() => okNonStreamingResponse({ text: 'no debería llegar' }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());

      expect(result).toBeNull();
      expect(fn).not.toHaveBeenCalled();
    });

    it('agente con HubSpot auto-captura + ambos tool IDs habilitados es elegible', async () => {
      setAgentDoc(
        baseAgentDoc({
          tools: [],
          hubspotAutoCaptureContacts: true,
          enabledMcpToolIds: ['mcp:hubspot:hubspot_search_contacts', 'mcp:hubspot:hubspot_create_contact'],
        }),
      );
      const { fn } = mockFetchCapture(() => okNonStreamingResponse({ text: 'ok hubspot' }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).not.toBeNull();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('agente con skill que declara tools MCP (skillsConfig.active_tools) es elegible', async () => {
      setAgentDoc(
        baseAgentDoc({
          tools: [],
          skillsConfig: [{ id: 'sk_1', enabled: true, config: { active_tools: ['mcp:calendar:book'] } }],
        }),
      );
      const { fn } = mockFetchCapture(() => okNonStreamingResponse({ text: 'ok skills mcp' }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).not.toBeNull();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('agente con enabledMcpToolIds explícitos (sin webhook/HubSpot/skills) es elegible', async () => {
      setAgentDoc(baseAgentDoc({ tools: [], enabledMcpToolIds: ['mcp:custom:search'] }));
      const { fn, calls } = mockFetchCapture(() => okNonStreamingResponse({ text: 'ok tools explícitas' }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).not.toBeNull();
      expect(calls[0]?.payload?.enabledToolIds).toEqual(['mcp:custom:search']);
    });

    it.each([
      ['hf/stable-diffusion-xl'],
      ['hf/flux-schnell'],
      ['vx/nano-banana-pro'],
      ['vx/image-gen-3'],
    ])('modelo de imagen (%s) excluye el path MCP aunque el agente sea elegible', async (model) => {
      setAgentDoc(baseAgentDoc({ model }));
      const { fn } = mockFetchCapture(() => okNonStreamingResponse({ text: 'no debería llegar' }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).toBeNull();
      expect(fn).not.toHaveBeenCalled();
    });

    it('modelo hf/ que NO es de imagen sigue siendo elegible', async () => {
      setAgentDoc(baseAgentDoc({ model: 'hf/llama-3-70b' }));
      const { fn } = mockFetchCapture(() => okNonStreamingResponse({ text: 'ok hf no-imagen' }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).not.toBeNull();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // ── Inferencia de replyProvider por prefijo de modelo ───────────────

  describe('inferencia de replyProvider por prefijo de modelo', () => {
    it.each([
      ['claude-3-5-sonnet-20241022', 'anthropic'],
      ['anthropic/claude-3-opus', 'anthropic'],
      ['hf/llama-3-70b', 'huggingface'],
      ['vx/gemini-1.5-pro', 'vertex'],
      ['deepseek-chat-v3', 'deepseek'],
      ['gemini-2.5-flash', 'vertex'], // sin prefijo reconocido → default vertex
    ])('modelo %s → replyProvider %s', async (model, expectedProvider) => {
      setAgentDoc(baseAgentDoc({ model }));
      const { fn, calls } = mockFetchCapture(() => okNonStreamingResponse({ text: 'ok' }));
      global.fetch = fn as unknown as typeof fetch;

      await tryServeWidgetChatViaHubMcp(baseParams());
      expect(calls[0]?.payload?.replyProvider).toBe(expectedProvider);
      expect(calls[0]?.payload?.model).toBe(model);
    });
  });

  // ── Filtrado de history malformado ──────────────────────────────────

  describe('filtrado de history malformado', () => {
    it('descarta entradas inválidas y normaliza assistant→model, conservando solo las válidas', async () => {
      setAgentDoc(baseAgentDoc());
      const { fn, calls } = mockFetchCapture(() => okNonStreamingResponse({ text: 'ok' }));
      global.fetch = fn as unknown as typeof fetch;

      const history = [
        { role: 'user', content: 'Hola' },
        { role: 'model', content: '¿En qué te ayudo?' },
        { role: 'assistant', content: 'Como digas' }, // assistant → normaliza a model
        null,
        { role: 'system', content: 'prompt interno' }, // role no soportado → descartada
        { role: 'user', content: 42 }, // content no-string → descartada
        { role: 'user' }, // sin content → descartada
        'garbage',
      ];

      await tryServeWidgetChatViaHubMcp(
        baseParams({ rawBody: JSON.stringify({ message: 'Hola, necesito ayuda con mi pedido', history }) }),
      );

      expect(calls[0]?.payload?.history).toEqual([
        { role: 'user', content: 'Hola' },
        { role: 'model', content: '¿En qué te ayudo?' },
        { role: 'model', content: 'Como digas' },
      ]);
    });

    it('history ausente o no-array se envía como []', async () => {
      setAgentDoc(baseAgentDoc());
      const { fn, calls } = mockFetchCapture(() => okNonStreamingResponse({ text: 'ok' }));
      global.fetch = fn as unknown as typeof fetch;

      await tryServeWidgetChatViaHubMcp(
        baseParams({ rawBody: JSON.stringify({ message: 'Hola, necesito ayuda con mi pedido' }) }),
      );
      expect(calls[0]?.payload?.history).toEqual([]);
    });
  });

  // ── Respuesta exitosa — no streaming ─────────────────────────────────

  describe('respuesta exitosa (no streaming)', () => {
    it('devuelve reply + toolsUsed + toolRounds tal cual los manda el hub', async () => {
      setAgentDoc(baseAgentDoc());
      const { fn, calls } = mockFetchCapture(() =>
        okNonStreamingResponse({ text: 'Encontré tu pedido.', toolsUsed: ['webhook:lead_captured'], toolRounds: 1 }),
      );
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).toEqual({ reply: 'Encontré tu pedido.', toolsUsed: ['webhook:lead_captured'], toolRounds: 1 });
      // sin onStatus, la URL no debe llevar sufijo /stream
      expect(calls[0]?.url).toBe('http://hub.test/api/mcp/widget-chat');
    });
  });

  // ── Respuesta exitosa — streaming SSE ────────────────────────────────

  describe('respuesta exitosa (streaming SSE)', () => {
    it('con onStatus usa el endpoint /stream, emite los status intermedios y resuelve con el evento done', async () => {
      setAgentDoc(baseAgentDoc());
      const raw = sseEvents([
        { type: 'status', phase: 'tools', message: 'Buscando información…' },
        { type: 'status', phase: 'tools', message: 'Ejecutando herramienta…' },
        {
          type: 'done',
          reply: 'Listo, encontré tu pedido.',
          toolsUsed: ['webhook:lead_captured', 'mcp:sheet:inventario'],
          toolRounds: 2,
        },
      ]);
      const { fn, calls } = mockFetchCapture(() => sseResponse(raw));
      global.fetch = fn as unknown as typeof fetch;

      const onStatus = vi.fn();
      const result = await tryServeWidgetChatViaHubMcp(baseParams({ onStatus }));

      expect(calls[0]?.url).toBe('http://hub.test/api/mcp/widget-chat/stream');
      expect(onStatus).toHaveBeenNthCalledWith(1, 'tools', 'Buscando información…');
      expect(onStatus).toHaveBeenNthCalledWith(2, 'tools', 'Ejecutando herramienta…');
      expect(result).toEqual({
        reply: 'Listo, encontré tu pedido.',
        toolsUsed: ['webhook:lead_captured', 'mcp:sheet:inventario'],
        toolRounds: 2,
      });
    });

    it('ignora líneas SSE con JSON corrupto y sigue procesando el resto del stream', async () => {
      setAgentDoc(baseAgentDoc());
      const raw =
        'data: {esto no es JSON válido\n\n' +
        sseEvents([{ type: 'done', reply: 'ok final', toolsUsed: [], toolRounds: 0 }]);
      const { fn } = mockFetchCapture(() => sseResponse(raw));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams({ onStatus: vi.fn() }));
      expect(result).toEqual({ reply: 'ok final', toolsUsed: [], toolRounds: 0 });
    });
  });

  // ── Errores del hub — no streaming ───────────────────────────────────

  describe('errores del hub (no streaming)', () => {
    it('HTTP no-OK (5xx) devuelve null', async () => {
      setAgentDoc(baseAgentDoc());
      const { fn } = mockFetchCapture(() => httpErrorResponse(500, 'Internal Server Error'));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).toBeNull();
    });

    it('body no parseable como JSON devuelve null', async () => {
      setAgentDoc(baseAgentDoc());
      const { fn } = mockFetchCapture(() => nonJsonResponse('<html>not json</html>'));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).toBeNull();
    });

    it('JSON válido pero sin data.text devuelve null (success:false)', async () => {
      setAgentDoc(baseAgentDoc());
      const { fn } = mockFetchCapture(() => ({ ok: true, text: async () => JSON.stringify({ success: false }) }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).toBeNull();
    });

    it('JSON válido con data pero sin campo text devuelve null', async () => {
      setAgentDoc(baseAgentDoc());
      const { fn } = mockFetchCapture(() => ({
        ok: true,
        text: async () => JSON.stringify({ success: true, data: { toolsUsed: ['x'] } }),
      }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).toBeNull();
    });
  });

  // ── Errores del hub — streaming SSE ──────────────────────────────────

  describe('errores del hub (streaming SSE)', () => {
    it('evento type:error corta el stream y devuelve null', async () => {
      setAgentDoc(baseAgentDoc());
      const raw = sseEvents([
        { type: 'status', phase: 'tools', message: 'Buscando…' },
        { type: 'error', code: 'TOOL_TIMEOUT', message: 'la tool no respondió' },
      ]);
      const { fn } = mockFetchCapture(() => sseResponse(raw));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams({ onStatus: vi.fn() }));
      expect(result).toBeNull();
    });

    it('stream que termina sin evento done devuelve null', async () => {
      setAgentDoc(baseAgentDoc());
      const raw = sseEvents([{ type: 'status', phase: 'tools', message: 'Buscando…' }]);
      const { fn } = mockFetchCapture(() => sseResponse(raw));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams({ onStatus: vi.fn() }));
      expect(result).toBeNull();
    });
  });

  // ── Propagación de toolRounds / toolsUsed ────────────────────────────

  describe('propagación de toolRounds / toolsUsed', () => {
    it('cadena de múltiples tools (toolRounds > 1) se propaga completa, sin truncar', async () => {
      setAgentDoc(baseAgentDoc());
      const toolsUsed = ['webhook:lead_captured', 'mcp:hubspot:hubspot_search_contacts', 'mcp:sheet:inventario'];
      const { fn } = mockFetchCapture(() => okNonStreamingResponse({ text: 'listo', toolsUsed, toolRounds: 3 }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result?.toolRounds).toBe(3);
      expect(result?.toolsUsed).toEqual(toolsUsed);
    });

    it('sin toolsUsed/toolRounds en la respuesta, quedan undefined pero el reply se devuelve igual', async () => {
      setAgentDoc(baseAgentDoc());
      const { fn } = mockFetchCapture(() => okNonStreamingResponse({ text: 'solo texto, sin tools' }));
      global.fetch = fn as unknown as typeof fetch;

      const result = await tryServeWidgetChatViaHubMcp(baseParams());
      expect(result).toEqual({ reply: 'solo texto, sin tools', toolsUsed: undefined, toolRounds: undefined });
    });
  });
});
