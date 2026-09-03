'use client';

import { create } from 'zustand';

/** Estado de UI del dashboard — persiste al navegar entre rutas (no es estado de servidor). */

type InboxTab = 'open' | 'resolved';
type InboxReplyFilter = 'unanswered' | 'answered';
type ChatsTab = 'active' | 'all' | 'ended' | 'loads';

type DashboardUiState = {
  inbox: {
    tab: InboxTab;
    replyFilter: InboxReplyFilter;
    expandedSessionId: string | null;
    livePollingSessionId: string | null;
    replyDrafts: Record<string, string>;
  };
  chats: {
    tab: ChatsTab;
    selectedSessionId: string | null;
    search: string;
    widgetFilter: string;
    mobileShowThread: boolean;
  };
  setInboxTab: (tab: InboxTab) => void;
  setInboxReplyFilter: (filter: InboxReplyFilter) => void;
  openInboxChat: (sessionId: string, poll: boolean) => void;
  closeInboxChat: () => void;
  setInboxReplyDraft: (sessionId: string, text: string) => void;
  clearInboxReplyDraft: (sessionId: string) => void;
  setChatsTab: (tab: ChatsTab) => void;
  selectChatSession: (sessionId: string) => void;
  clearChatSelection: () => void;
  setChatsSearch: (search: string) => void;
  setChatsWidgetFilter: (widgetFilter: string) => void;
  setChatsMobileShowThread: (show: boolean) => void;
};

export const useDashboardUiStore = create<DashboardUiState>((set) => ({
  inbox: {
    tab: 'open',
    replyFilter: 'unanswered',
    expandedSessionId: null,
    livePollingSessionId: null,
    replyDrafts: {},
  },
  chats: {
    tab: 'active',
    selectedSessionId: null,
    search: '',
    widgetFilter: '',
    mobileShowThread: false,
  },

  setInboxTab: (tab) => set((s) => ({ inbox: { ...s.inbox, tab } })),

  setInboxReplyFilter: (replyFilter) => set((s) => ({ inbox: { ...s.inbox, replyFilter } })),

  openInboxChat: (sessionId, poll) =>
    set((s) => ({
      inbox: {
        ...s.inbox,
        expandedSessionId: sessionId,
        livePollingSessionId: poll ? sessionId : null,
      },
    })),

  closeInboxChat: () =>
    set((s) => ({
      inbox: {
        ...s.inbox,
        expandedSessionId: null,
        livePollingSessionId: null,
      },
    })),

  setInboxReplyDraft: (sessionId, text) =>
    set((s) => ({
      inbox: {
        ...s.inbox,
        replyDrafts: { ...s.inbox.replyDrafts, [sessionId]: text },
      },
    })),

  clearInboxReplyDraft: (sessionId) =>
    set((s) => {
      const { [sessionId]: _, ...rest } = s.inbox.replyDrafts;
      return { inbox: { ...s.inbox, replyDrafts: rest } };
    }),

  setChatsTab: (tab) =>
    set((s) => ({
      chats: { ...s.chats, tab, selectedSessionId: null, mobileShowThread: false },
    })),

  selectChatSession: (sessionId) =>
    set((s) => ({
      chats: { ...s.chats, selectedSessionId: sessionId, mobileShowThread: true },
    })),

  clearChatSelection: () =>
    set((s) => ({
      chats: { ...s.chats, selectedSessionId: null, mobileShowThread: false },
    })),

  setChatsSearch: (search) => set((s) => ({ chats: { ...s.chats, search } })),

  setChatsWidgetFilter: (widgetFilter) => set((s) => ({ chats: { ...s.chats, widgetFilter } })),

  setChatsMobileShowThread: (mobileShowThread) =>
    set((s) => ({ chats: { ...s.chats, mobileShowThread } })),
}));

/** Selectores estables para evitar re-renders innecesarios. */
export const useInboxUi = () => useDashboardUiStore((s) => s.inbox);
export const useChatsUi = () => useDashboardUiStore((s) => s.chats);
