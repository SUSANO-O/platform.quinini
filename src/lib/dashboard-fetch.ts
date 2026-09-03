/** Fetchers compartidos — usados por hooks y prefetch del sidebar. */

import type { InboxCardItem } from '@/components/dashboard/inbox-request-card';
import type { ChatMessage } from '@/components/dashboard/inbox-chat-modal';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    const msg = typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : 'Error al cargar datos.';
    throw new Error(msg);
  }
  return data as T;
}

export type InboxListResult = { items: InboxCardItem[]; openCount: number };

export async function fetchInboxList(status: 'open' | 'resolved'): Promise<InboxListResult> {
  const res = await fetch(`/api/inbox?status=${status}`);
  const data = await parseJson<{ items?: InboxCardItem[]; openCount?: number }>(res);
  return {
    items: Array.isArray(data.items) ? data.items : [],
    openCount: typeof data.openCount === 'number' ? data.openCount : 0,
  };
}

export async function fetchInboxCount(): Promise<number> {
  const res = await fetch('/api/inbox/count', { cache: 'no-store' });
  const data = await parseJson<{ openCount?: number }>(res);
  return typeof data.openCount === 'number' ? data.openCount : 0;
}

export type InboxThreadResult = {
  messages: ChatMessage[];
  humanMode: boolean;
};

export async function fetchInboxThread(sessionId: string): Promise<InboxThreadResult> {
  const res = await fetch(`/api/inbox/${encodeURIComponent(sessionId)}`);
  const data = await parseJson<{
    messages?: ChatMessage[];
    session?: { humanMode?: boolean };
  }>(res);
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    humanMode: Boolean(data.session?.humanMode),
  };
}

export type ChatSessionItem = {
  sessionId: string;
  widgetName: string;
  agentId: string;
  visitorLabel: string;
  visitorId: string;
  contact: { name?: string; email?: string; phone?: string };
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  messageCount: number;
  escalated: boolean;
  humanMode: boolean;
  sentiment: string;
  lastMessage: string;
  lastRole: string;
  lastSentBy: string;
  lastMessageAt: string | null;
};

export type ConversationsListResult = { items: ChatSessionItem[]; activeCount: number };

export async function fetchConversationsList(
  status: 'active' | 'all' | 'ended',
): Promise<ConversationsListResult> {
  const res = await fetch(`/api/conversations?status=${status}&limit=80`);
  const data = await parseJson<{ items?: ChatSessionItem[]; activeCount?: number }>(res);
  return {
    items: Array.isArray(data.items) ? data.items : [],
    activeCount: typeof data.activeCount === 'number' ? data.activeCount : 0,
  };
}

export type ConversationThreadResult = {
  messages: ChatMessage[];
  session: {
    sessionId: string;
    widgetName: string;
    agentId: string;
    visitorLabel: string;
    startedAt: string;
    endedAt: string | null;
    escalated: boolean;
    humanMode: boolean;
  } | null;
};

export async function fetchConversationThread(sessionId: string): Promise<ConversationThreadResult> {
  const res = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}`);
  const data = await parseJson<{
    messages?: ChatMessage[];
    session?: ConversationThreadResult['session'];
  }>(res);
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    session: data.session ?? null,
  };
}

export type AgentListItem = {
  id: string;
  name: string;
  status: string;
  type: string;
  isPlatform?: boolean;
  model?: string;
  [key: string]: unknown;
};

export async function fetchAgentsList(): Promise<AgentListItem[]> {
  const res = await fetch('/api/agents');
  const data = await parseJson<{ agents?: AgentListItem[] }>(res);
  return Array.isArray(data.agents) ? data.agents : [];
}

export type WidgetListItem = {
  id: string;
  name: string;
  active?: boolean;
  [key: string]: unknown;
};

export async function fetchWidgetsList(): Promise<WidgetListItem[]> {
  const res = await fetch('/api/widgets');
  const data = await parseJson<{ widgets?: WidgetListItem[] }>(res);
  return Array.isArray(data.widgets) ? data.widgets : [];
}
