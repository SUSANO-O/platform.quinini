import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Un agente cuya única integración está caída hacía en cada mensaje un intento por el hub que
 * terminaba en NO_MCP_TOOLS (~1,3 s) antes de ir a la inferencia directa. Se recuerda 2 min.
 */
const tryHub = vi.fn();
vi.mock('@/lib/widget-chat-direct-mcp', () => ({
  tryServeWidgetChatViaHubMcp: (p: unknown) => tryHub(p),
}));
vi.mock('@/lib/debug-widget-flow', () => ({ logWidgetFlow: vi.fn() }));

import {
  NO_MCP_TOOLS_TTL_MS,
  __resetNoMcpToolsMemoForTests,
  tryServeWidgetChatViaHubMcpMemo,
} from '@/lib/widget-no-mcp-tools-memo';

function params(agentId = 'agent-1') {
  return {
    widgetTokenStartsWithWt: true,
    parsedAgentId: agentId,
    rawBody: '{"message":"hola"}',
    ownerUserId: 'u1',
    outcome: {} as { noMcpTools?: boolean },
  };
}

beforeEach(() => {
  tryHub.mockReset();
  __resetNoMcpToolsMemoForTests();
});
afterEach(() => vi.useRealTimers());

describe('tryServeWidgetChatViaHubMcpMemo', () => {
  it('tras NO_MCP_TOOLS, el siguiente mensaje no vuelve al hub y sigue marcado noMcpTools', async () => {
    tryHub.mockImplementation(async (p: { outcome: { noMcpTools?: boolean } }) => {
      p.outcome.noMcpTools = true;
      return null;
    });
    const first = params();
    expect(await tryServeWidgetChatViaHubMcpMemo(first)).toBeNull();
    expect(first.outcome.noMcpTools).toBe(true);

    const second = params();
    expect(await tryServeWidgetChatViaHubMcpMemo(second)).toBeNull();
    expect(second.outcome.noMcpTools).toBe(true);
    expect(tryHub).toHaveBeenCalledTimes(1);
  });

  it('pasado el TTL vuelve a intentar (las tools se recuperan solas)', async () => {
    vi.useFakeTimers();
    tryHub.mockImplementationOnce(async (p: { outcome: { noMcpTools?: boolean } }) => {
      p.outcome.noMcpTools = true;
      return null;
    });
    await tryServeWidgetChatViaHubMcpMemo(params());
    vi.advanceTimersByTime(NO_MCP_TOOLS_TTL_MS + 1);
    tryHub.mockResolvedValueOnce({ reply: 'con tools' });
    expect(await tryServeWidgetChatViaHubMcpMemo(params())).toEqual({ reply: 'con tools' });
    expect(tryHub).toHaveBeenCalledTimes(2);
  });

  it('otros errores del hub no se recuerdan; otros agentes no se ven afectados', async () => {
    tryHub.mockResolvedValue(null);
    await tryServeWidgetChatViaHubMcpMemo(params());
    await tryServeWidgetChatViaHubMcpMemo(params());
    expect(tryHub).toHaveBeenCalledTimes(2);

    tryHub.mockImplementationOnce(async (p: { outcome: { noMcpTools?: boolean } }) => {
      p.outcome.noMcpTools = true;
      return null;
    });
    await tryServeWidgetChatViaHubMcpMemo(params('caido'));
    const otro = params('sano');
    tryHub.mockResolvedValueOnce({ reply: 'ok' });
    expect(await tryServeWidgetChatViaHubMcpMemo(otro)).toEqual({ reply: 'ok' });
    expect(otro.outcome.noMcpTools).toBeUndefined();
  });
});
