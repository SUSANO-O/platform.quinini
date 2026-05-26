/**
 * Enriquecimiento de peticiones widget/chat: contexto de sesión, facts, límites de historial.
 */

import { Subscription } from '@/lib/db/models';
import { hubFetch, hubCreateHeaders } from '@/lib/aibackhub-sync';
import { maxWidgetHistoryTurns } from '@/lib/widget-memory-plan';
import {
  appendSessionRoutingNote,
  extractLightFactsFromMessage,
  formatSessionContextBlock,
  loadWidgetSessionContext,
  mergeSessionFacts,
} from '@/lib/widget-session-context';
import { normalizeVisitorId } from '@/lib/widget-visitor';
import type { MultiAgentRoutingMeta } from '@/lib/widget-multi-agent';

export type WidgetChatBodyFields = {
  agentId?: string;
  widgetId?: string;
  sessionId?: string;
  visitorId?: string;
  message?: string;
  history?: Array<{ role: string; content: string }>;
  systemPromptOverride?: string;
  sessionContextBlock?: string;
};

export function parseWidgetChatBody(rawBody: string): WidgetChatBodyFields | null {
  try {
    return JSON.parse(rawBody) as WidgetChatBodyFields;
  } catch {
    return null;
  }
}

function trimHistory(
  history: Array<{ role: string; content: string }> | undefined,
  maxUserTurns: number,
): Array<{ role: string; content: string }> {
  if (!Array.isArray(history) || history.length === 0) return [];
  const rows = history.filter(
    (h) => h && (h.role === 'user' || h.role === 'model') && typeof h.content === 'string',
  );
  let userCount = 0;
  const kept: typeof rows = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    kept.unshift(rows[i]);
    if (rows[i].role === 'user') {
      userCount++;
      if (userCount >= maxUserTurns) break;
    }
  }
  return kept;
}

async function effectivePlanForUser(userId: string): Promise<string> {
  const sub = await Subscription.findOne({ userId }).select({ plan: 1, status: 1 }).lean() as
    | { plan?: string; status?: string }
    | null;
  const active = sub?.status === 'active' || sub?.status === 'trialing' || sub?.status === 'past_due';
  return active ? (sub?.plan ?? 'free') : 'free';
}

/** Añade contexto compartido, recorta historial y expone visitorId para el hub. */
export async function enrichWidgetChatBody(params: {
  rawBody: string;
  ownerUserId: string;
  widgetId?: string;
}): Promise<string> {
  const parsed = parseWidgetChatBody(params.rawBody);
  if (!parsed) return params.rawBody;

  const chatSessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId.trim() : '';
  const visitorId = normalizeVisitorId(parsed.visitorId);
  const widgetId = (params.widgetId || parsed.widgetId || '').trim();
  const message = typeof parsed.message === 'string' ? parsed.message : '';

  const plan = await effectivePlanForUser(params.ownerUserId);
  const maxTurns = maxWidgetHistoryTurns(plan);
  parsed.history = trimHistory(parsed.history, maxTurns);

  if (widgetId && chatSessionId && message.trim()) {
    void mergeSessionFacts(
      widgetId,
      chatSessionId,
      params.ownerUserId,
      extractLightFactsFromMessage(message),
    ).catch(() => {});
  }

  if (widgetId && chatSessionId) {
    const ctx = await loadWidgetSessionContext(widgetId, chatSessionId, params.ownerUserId);
    const block = formatSessionContextBlock(ctx);
    if (block) parsed.sessionContextBlock = block;
  }

  if (visitorId) parsed.visitorId = visitorId;

  return JSON.stringify(parsed);
}

export async function afterWidgetChatSuccess(params: {
  ownerUserId: string;
  widgetId?: string;
  chatSessionId: string;
  visitorId?: string | null;
  hubAgentId: string;
  userMessage: string;
  agentResponse: string;
  routingMeta?: MultiAgentRoutingMeta | null;
}): Promise<void> {
  const vid = normalizeVisitorId(params.visitorId);
  const sid = params.chatSessionId.trim();
  if (!sid || !params.hubAgentId) return;

  if (params.widgetId && params.routingMeta) {
    const note = `Derivado a ${params.routingMeta.routedAgentName} (${params.routingMeta.triageMethod})`;
    void appendSessionRoutingNote(
      params.widgetId,
      sid,
      params.ownerUserId,
      note,
      params.routingMeta.routedAgentName,
    ).catch(() => {});
  }

  void hubFetch(
    '/api/embeddings/memory/store',
    {
      method: 'POST',
      headers: hubCreateHeaders(),
      body: JSON.stringify({
        agentId: params.hubAgentId,
        sessionId: sid,
        visitorId: vid ?? undefined,
        userMessage: params.userMessage.slice(0, 2000),
        agentResponse: params.agentResponse.slice(0, 2000),
      }),
    },
    8_000,
  ).catch(() => {});
}
