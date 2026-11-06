import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** El banco de pruebas pide al hub el modo de prueba; el chat real nunca lo envía. */
const { mockFindOne } = vi.hoisted(() => ({ mockFindOne: vi.fn() }));
vi.mock('@/lib/db/connection', () => ({ connectDB: vi.fn() }));
vi.mock('@/lib/db/models', () => ({ ClientAgent: { findOne: mockFindOne } }));
vi.mock('@/lib/aibackhub-sync', () => ({
  getAibackhubBaseUrl: () => 'https://hub.test',
  hubCreateHeaders: () => ({}),
  hubFetch: vi.fn(),
  syncHubCatalogFromLandingAgentDoc: vi.fn(async () => undefined),
}));

import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';

const AGENT = { _id: 'agent_1', agentHubId: '', model: 'vx/gemini-2.5-flash', systemPrompt: 'Eres Navi.', tools: [], enabledMcpToolIds: ['mcp:slack:slack_create_ticket'] };
const BODY = JSON.stringify({ message: 'Quiero reportar un problema con la plataforma', history: [] });

let sent: Record<string, unknown> | null = null;
beforeEach(() => {
  sent = null;
  mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(AGENT) });
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ success: true, data: { text: 'ok' } }), { status: 200 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('tryServeWidgetChatViaHubMcp — modo de prueba', () => {
  it('con sandbox: true lo envía al hub', async () => {
    await tryServeWidgetChatViaHubMcp({ widgetTokenStartsWithWt: true, parsedAgentId: 'agent_1', rawBody: BODY, ownerUserId: 'u1', sandbox: true });
    expect(sent?.sandbox).toBe(true);
  });

  it('sin el parámetro (chat real) no lo envía, aunque el cuerpo del widget lo traiga', async () => {
    const forged = JSON.stringify({ ...JSON.parse(BODY), sandbox: true });
    await tryServeWidgetChatViaHubMcp({ widgetTokenStartsWithWt: true, parsedAgentId: 'agent_1', rawBody: forged, ownerUserId: 'u1' });
    expect(sent).not.toBeNull();
    expect(sent?.sandbox).toBeUndefined();
  });
});
