import { isTrivialMessage, type SimpleTurn } from './trivial-message';

type HistoryTurn = { role?: string; content?: string } | null | undefined;

/**
 * Tal cual antes del recorte 9:35: HubSpot y webhook nunca se saltan.
 * Solo un "hola" de un agente MCP sin esas vías usa el camino barato.
 */
export function shouldOmitMcpPipelineForTurn(params: {
  hasWebhook: boolean;
  wantsHubspotAutoCapture: boolean;
  skillsNeedMcp: boolean;
  hasExplicitMcpIds: boolean;
  message: string;
  history?: HistoryTurn[] | null;
}): boolean {
  if (params.hasWebhook || params.wantsHubspotAutoCapture) return false;
  if (!(params.skillsNeedMcp || params.hasExplicitMcpIds)) return false;
  const hist = Array.isArray(params.history)
    ? params.history.filter((h): h is SimpleTurn => {
        if (!h || typeof h !== 'object') return false;
        return typeof h.role === 'string' && typeof h.content === 'string';
      })
    : undefined;
  return isTrivialMessage(params.message, hist);
}
