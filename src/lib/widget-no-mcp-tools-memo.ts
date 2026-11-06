import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';
import { logWidgetFlow } from '@/lib/debug-widget-flow';

/**
 * Agentes a los que el hub acaba de responder NO_MCP_TOOLS (p. ej. su única integración caída).
 * Mientras dure, el chat se salta el intento por el hub (~1,3 s por mensaje medidos en producción)
 * y marca `noMcpTools`, así que sigue por la inferencia directa exactamente igual que tras el fallo.
 * Corto a propósito: si la integración vuelve, las tools se recuperan en ≤ 2 min.
 */
export const NO_MCP_TOOLS_TTL_MS = 2 * 60_000;
const noMcpToolsUntil = new Map<string, number>();

export function recentlyNoMcpTools(agentId: string, now = Date.now()): boolean {
  const until = noMcpToolsUntil.get(agentId);
  if (until === undefined) return false;
  if (until > now) return true;
  noMcpToolsUntil.delete(agentId);
  return false;
}

export function __resetNoMcpToolsMemoForTests(): void {
  noMcpToolsUntil.clear();
}

type HubMcpParams = Parameters<typeof tryServeWidgetChatViaHubMcp>[0];

/** `tryServeWidgetChatViaHubMcp` que recuerda un NO_MCP_TOOLS reciente para no repetir el intento. */
export async function tryServeWidgetChatViaHubMcpMemo(
  params: HubMcpParams & { outcome: NonNullable<HubMcpParams['outcome']> },
): ReturnType<typeof tryServeWidgetChatViaHubMcp> {
  const agentId = params.parsedAgentId.trim();
  if (agentId && recentlyNoMcpTools(agentId)) {
    params.outcome.noMcpTools = true;
    logWidgetFlow('⏭️', 'direct:skip', 'NO_MCP_TOOLS reciente — directo a inferencia', { agentId });
    return null;
  }
  const out = await tryServeWidgetChatViaHubMcp(params);
  if (agentId && params.outcome.noMcpTools) noMcpToolsUntil.set(agentId, Date.now() + NO_MCP_TOOLS_TTL_MS);
  return out;
}
