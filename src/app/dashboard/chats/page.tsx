'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  MessageSquare,
  RefreshCw,
  Search,
  X,
} from '@/components/ui/icons';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ConversationThread, countVisibleMessages } from '@/components/dashboard/inbox-chat-modal';
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header';
import { BackgroundRefreshIndicator } from '@/components/dashboard/background-refresh-indicator';
import { dashboardKeys } from '@/lib/dashboard-query-keys';
import { fetchConversationsList, fetchConversationThread, fetchWidgetLoadEvents, type WidgetLoadEventItem } from '@/lib/dashboard-fetch';
import { notifyInboxChanged } from '@/hooks/use-inbox-open-count';
import { useDashboardUiStore } from '@/stores/dashboard-ui-store';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';

// ─── Types ──────────────────────────────────────────────────────────────────

type ChatSession = {
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

type SessionDetail = {
  sessionId: string;
  widgetName: string;
  agentId: string;
  visitorLabel: string;
  startedAt: string;
  endedAt: string | null;
  escalated: boolean;
  humanMode: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

function formatDuration(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

const AVATAR_PALETTE = [
  { bg: '#e6f2f4', fg: '#004A57', border: '#a8cdd4' },
  { bg: '#eef2f6', fg: '#475569', border: '#cbd5e1' },
  { bg: '#e6f2f1', fg: '#0f766e', border: '#a7d4cf' },
  { bg: '#edf2f7', fg: '#334155', border: '#c5d0dc' },
] as const;

function sessionColor(sessionId: string) {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) h = (h * 31 + sessionId.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

function sentimentTag(sentiment: string): { label: string; className: string } | null {
  if (sentiment === 'positive') return { label: 'Positivo', className: 'chats-page__tag chats-page__tag--sentiment-pos' };
  if (sentiment === 'negative') return { label: 'Negativo', className: 'chats-page__tag chats-page__tag--sentiment-neg' };
  return null;
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({
  item,
  selected,
  onClick,
}: {
  item: ChatSession;
  selected: boolean;
  onClick: () => void;
}) {
  const color = sessionColor(item.sessionId);
  const isActive = !item.endedAt;
  const sentiment = sentimentTag(item.sentiment);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`chats-page__session${selected ? ' is-selected' : ''}`}
    >
      <div className="chats-page__avatar-wrap">
        <div
          className="chats-page__avatar"
          style={{ background: color.bg, color: color.fg, border: `1.5px solid ${color.border}` }}
        >
          {initials(item.visitorLabel)}
        </div>
        {isActive ? <span className="chats-page__live-dot" aria-hidden /> : null}
      </div>

      <div className="chats-page__session-body">
        <div className="chats-page__session-row">
          <span className="chats-page__session-name">{item.visitorLabel}</span>
          <span className="chats-page__session-time">{timeAgo(item.lastMessageAt || item.startedAt)}</span>
        </div>
        <div className="chats-page__session-preview">
          {item.lastMessage || item.widgetName || 'Sin mensajes'}
        </div>
        <div className="chats-page__session-tags">
          {item.widgetName ? (
            <span className="chats-page__tag chats-page__tag--widget">{item.widgetName}</span>
          ) : null}
          {item.escalated ? (
            <span className="chats-page__tag chats-page__tag--escalated">Escalado</span>
          ) : null}
          {item.humanMode ? (
            <span className="chats-page__tag chats-page__tag--human">Humano</span>
          ) : null}
          {sentiment ? <span className={sentiment.className}>{sentiment.label}</span> : null}
          <span className="chats-page__tag chats-page__tag--widget">{item.messageCount} msg</span>
        </div>
      </div>
    </button>
  );
}

// ─── Tabs bar ────────────────────────────────────────────────────────────────

type ChatsTab = 'active' | 'all' | 'ended' | 'loads';

function ChatsTabsBar({
  tab,
  activeCount,
  onSelect,
}: {
  tab: ChatsTab;
  activeCount: number;
  onSelect: (tab: ChatsTab) => void;
}) {
  const tabs: { key: ChatsTab; label: string; badge: number }[] = [
    { key: 'active', label: 'Activos', badge: activeCount },
    { key: 'all', label: 'Todos', badge: 0 },
    { key: 'ended', label: 'Cerrados', badge: 0 },
    { key: 'loads', label: 'Cargas', badge: 0 },
  ];
  return (
    <div
      className="chats-page__tabs"
      role="tablist"
      aria-label="Filtrar chats"
      style={{
        marginBottom: '0.75rem',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--card)',
      }}
    >
      {tabs.map(({ key, label, badge }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          className={`chats-page__tab${tab === key ? ' is-active' : ''}`}
          onClick={() => onSelect(key)}
        >
          {key === 'active' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Circle size={7} fill="#22c55e" color="#22c55e" />
              {label}
              {badge > 0 ? <span className="chats-page__tab-badge">{badge}</span> : null}
            </span>
          ) : key === 'loads' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Globe size={11} />
              {label}
            </span>
          ) : label}
        </button>
      ))}
    </div>
  );
}

// ─── Load events view (evento widget_loaded: IP + hora + página) ──────────────

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function shortUserAgent(ua: string): string {
  if (!ua) return '—';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Otro';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iOS/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

function LoadEventsView({
  query,
}: {
  query: {
    data?: { items: WidgetLoadEventItem[]; totalCount: number; last24hCount: number };
    isLoading: boolean;
  };
}) {
  const data = query.data;
  const items = data?.items ?? [];

  return (
    <div
      className="chats-page__layout"
      style={{ flexDirection: 'column', display: 'flex' }}
    >
      <div
        style={{
          display: 'flex',
          gap: '1.25rem',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: '0.75rem',
          color: 'var(--muted-foreground)',
          flexShrink: 0,
        }}
      >
        <span>
          <strong style={{ color: 'var(--foreground)' }}>{data?.totalCount ?? 0}</strong> cargas registradas
        </span>
        <span>
          <strong style={{ color: 'var(--foreground)' }}>{data?.last24hCount ?? 0}</strong> en las últimas 24 h
        </span>
        <span style={{ marginLeft: 'auto', opacity: 0.75 }}>Se conservan 90 días</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {query.isLoading && items.length === 0 ? (
          <AiLoadingInline label="Cargando eventos…" style={{ padding: '2rem 1rem' }} />
        ) : items.length === 0 ? (
          <div className="chats-page__empty-panel" style={{ minHeight: '12rem' }}>
            <Globe size={32} style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600 }}>
              Aún no hay eventos de carga
            </p>
            <p style={{ margin: 0, fontSize: '0.8125rem', maxWidth: '20rem' }}>
              Cada vez que se carga una página con tu widget embebido, se registra aquí con IP y hora.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted-foreground)' }}>
                  {['Fecha y hora', 'IP', 'Widget', 'Página', 'Navegador'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '0.5rem 1rem',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border-subtle)',
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        top: 0,
                        background: 'var(--card)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((e) => {
                  const d = e.createdAt ? new Date(e.createdAt) : null;
                  const weekday = e.dayOfWeek != null ? WEEKDAYS[e.dayOfWeek] : '';
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}>
                        {d
                          ? `${weekday ? weekday + ' ' : ''}${d.toLocaleString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : '—'}
                      </td>
                      <td style={{ padding: '0.5rem 1rem', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>
                        {e.ip || '—'}
                      </td>
                      <td style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}>{e.widgetName || '—'}</td>
                      <td style={{ padding: '0.5rem 1rem', maxWidth: '22rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.pageUrl ? (
                          <a href={e.pageUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                            {e.pageUrl.replace(/^https?:\/\//, '')}
                          </a>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap', color: 'var(--muted-foreground)' }}>
                        {shortUserAgent(e.userAgent)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ChatsPage() {
  const queryClient = useQueryClient();
  const tab = useDashboardUiStore((s) => s.chats.tab);
  const search = useDashboardUiStore((s) => s.chats.search);
  const widgetFilter = useDashboardUiStore((s) => s.chats.widgetFilter);
  const selectedId = useDashboardUiStore((s) => s.chats.selectedSessionId);
  const mobileShowThread = useDashboardUiStore((s) => s.chats.mobileShowThread);
  const setChatsTab = useDashboardUiStore((s) => s.setChatsTab);
  const selectChatSession = useDashboardUiStore((s) => s.selectChatSession);
  const setChatsSearch = useDashboardUiStore((s) => s.setChatsSearch);
  const setChatsWidgetFilter = useDashboardUiStore((s) => s.setChatsWidgetFilter);
  const setChatsMobileShowThread = useDashboardUiStore((s) => s.setChatsMobileShowThread);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<{ sessionId: string; label: string } | null>(null);

  // La pestaña "Cargas" muestra eventos widget_loaded, no conversaciones.
  const listTab: 'active' | 'all' | 'ended' = tab === 'loads' ? 'active' : tab;

  const conversationsQuery = useQuery({
    queryKey: dashboardKeys.conversations(listTab),
    queryFn: () => fetchConversationsList(listTab),
    refetchInterval: 8000,
  });

  const loadEventsQuery = useQuery({
    queryKey: dashboardKeys.widgetLoadEvents(),
    queryFn: fetchWidgetLoadEvents,
    enabled: tab === 'loads',
    refetchInterval: 15000,
  });

  const sessions = conversationsQuery.data?.items ?? [];
  const activeCount = conversationsQuery.data?.activeCount ?? 0;
  const showListSpinner = conversationsQuery.isLoading && sessions.length === 0;

  const threadQuery = useQuery({
    queryKey: dashboardKeys.conversationThread(selectedId ?? ''),
    queryFn: () => fetchConversationThread(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: (query) => {
      const ended = query.state.data?.session?.endedAt;
      return selectedId && !ended ? 4000 : false;
    },
  });

  const messages = threadQuery.data?.messages ?? [];
  const sessionDetail = (threadQuery.data?.session as SessionDetail | null) ?? null;
  const showThreadSpinner = Boolean(selectedId) && threadQuery.isLoading && messages.length === 0;

  const widgetOptions = useMemo(() => {
    const names = new Set<string>();
    for (const s of sessions) {
      if (s.widgetName?.trim()) names.add(s.widgetName.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (widgetFilter && s.widgetName !== widgetFilter) return false;
      if (!q) return true;
      const haystack = [
        s.visitorLabel,
        s.widgetName,
        s.lastMessage,
        s.contact.email,
        s.contact.phone,
        s.contact.name,
        s.sessionId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sessions, search, widgetFilter]);

  function selectSession(sessionId: string) {
    if (sessionId === selectedId) return;
    selectChatSession(sessionId);
  }

  async function closeSession(sessionId: string) {
    setClosingId(sessionId);
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Error al cerrar.');
        return;
      }
      toast.success('Sesión cerrada.');
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.conversations(listTab) });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.inbox('open') });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.inbox('resolved') });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.inboxCount() });
      notifyInboxChanged();
      if (selectedId === sessionId) {
        queryClient.setQueryData(dashboardKeys.conversationThread(sessionId), (old: Awaited<ReturnType<typeof fetchConversationThread>> | undefined) => {
          if (!old?.session) return old;
          return {
            ...old,
            session: { ...old.session, endedAt: data.endedAt ?? new Date().toISOString() },
          };
        });
      }
    } finally {
      setClosingId(null);
      setConfirmClose(null);
    }
  }

  async function copySessionId(sessionId: string) {
    try {
      await navigator.clipboard.writeText(sessionId);
      toast.success('ID de sesión copiado.');
    } catch {
      toast.error('No se pudo copiar.');
    }
  }

  const selectedSession = sessions.find((s) => s.sessionId === selectedId);
  const visibleMessageCount = useMemo(() => countVisibleMessages(messages), [messages]);
  const isSelectedActive = selectedSession ? !selectedSession.endedAt : false;
  const contact = selectedSession?.contact ?? {};
  const showSidebar = !mobileShowThread;
  const showPanel = mobileShowThread || selectedId !== null;

  return (
    <DashboardShell width="wide" className="chats-page-shell">
      <div className="chats-page">
        <DashboardPageHeader
          badge="Conversaciones"
          badgeIcon={MessageSquare}
          title="Chats"
          description={`Historial de tus widgets · ${activeCount} activa${activeCount !== 1 ? 's' : ''}`}
          compact
          hideIcon
          actions={(
            <>
              <BackgroundRefreshIndicator
                active={tab === 'loads'
                  ? loadEventsQuery.isFetching
                  : conversationsQuery.isFetching && !showListSpinner}
              />
              <button
                type="button"
                className="dashboard-meta-chip"
                onClick={() => void (tab === 'loads' ? loadEventsQuery.refetch() : conversationsQuery.refetch())}
              >
                <RefreshCw size={10} />
                Actualizar
              </button>
            </>
          )}
        />

        <ChatsTabsBar tab={tab} activeCount={activeCount} onSelect={setChatsTab} />

        {tab === 'loads' ? (
          <LoadEventsView query={loadEventsQuery} />
        ) : (
        <div className="chats-page__layout">
          {/* Lista de sesiones */}
          <aside className={`chats-page__sidebar${showSidebar ? '' : ' chats-page__sidebar--hidden-mobile'}`}>
            <div className="chats-page__filters">
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--muted-foreground)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="search"
                  className="chats-page__search"
                  placeholder="Buscar visitante, widget, mensaje…"
                  value={search}
                  onChange={(e) => setChatsSearch(e.target.value)}
                  style={{ paddingLeft: '2rem' }}
                />
              </div>
              {widgetOptions.length > 1 ? (
                <select
                  className="chats-page__widget-select"
                  value={widgetFilter}
                  onChange={(e) => setChatsWidgetFilter(e.target.value)}
                  aria-label="Filtrar por widget"
                >
                  <option value="">Todos los widgets</option>
                  {widgetOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="chats-page__list">
              {showListSpinner ? (
                <AiLoadingInline
                  label="Cargando chats…"
                  hint="Recuperando sesiones de tus widgets"
                  style={{ padding: '2rem 1rem' }}
                />
              ) : filteredSessions.length === 0 ? (
                <div className="chats-page__empty-panel" style={{ minHeight: '12rem' }}>
                  <MessageSquare size={32} style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600 }}>
                    {search || widgetFilter
                      ? 'Sin resultados para este filtro'
                      : tab === 'active'
                        ? 'No hay chats activos'
                        : tab === 'ended'
                          ? 'No hay chats cerrados'
                          : 'No hay chats registrados'}
                  </p>
                </div>
              ) : (
                filteredSessions.map((item) => (
                  <SessionCard
                    key={item.sessionId}
                    item={item}
                    selected={selectedId === item.sessionId}
                    onClick={() => selectSession(item.sessionId)}
                  />
                ))
              )}
            </div>
          </aside>

          {/* Panel de mensajes */}
          <section
            className={`chats-page__panel${showPanel && selectedId ? '' : ' chats-page__panel--hidden-mobile'}`}
          >
            {!selectedId ? (
              <div className="chats-page__empty-panel">
                <MessageSquare size={40} style={{ color: 'var(--muted-foreground)', opacity: 0.45 }} />
                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>Selecciona un chat</p>
                <p style={{ margin: 0, fontSize: '0.8125rem', maxWidth: '16rem' }}>
                  Elige una conversación de la lista para ver el historial completo de mensajes.
                </p>
              </div>
            ) : (
              <>
                <header className="chats-page__thread-header">
                  <div className="chats-page__thread-identity">
                    <button
                      type="button"
                      className="chats-page__back"
                      onClick={() => setChatsMobileShowThread(false)}
                    >
                      <ArrowLeft size={16} />
                      Volver
                    </button>
                    <div
                      className="chats-page__avatar"
                      style={{
                        width: '2.125rem',
                        height: '2.125rem',
                        background: selectedSession ? sessionColor(selectedSession.sessionId).bg : 'var(--muted)',
                        color: selectedSession ? sessionColor(selectedSession.sessionId).fg : 'var(--muted-foreground)',
                        border: selectedSession
                          ? `1.5px solid ${sessionColor(selectedSession.sessionId).border}`
                          : '1px solid var(--border-subtle)',
                      }}
                    >
                      {selectedSession ? initials(selectedSession.visitorLabel) : '?'}
                    </div>
                    <div className="chats-page__thread-meta">
                      <div className="chats-page__thread-name">
                        {sessionDetail?.visitorLabel || selectedSession?.visitorLabel || '…'}
                      </div>
                      <div className="chats-page__thread-sub">
                        <span>{sessionDetail?.widgetName || selectedSession?.widgetName}</span>
                        {selectedSession ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={10} />
                            {formatDuration(selectedSession.durationSec)}
                          </span>
                        ) : null}
                        {isSelectedActive ? (
                          <span className="chats-page__status-live">● Activo</span>
                        ) : (
                          <span className="chats-page__status-closed">● Cerrado</span>
                        )}
                      </div>
                      {(contact.email || contact.phone) ? (
                        <div className="chats-page__contact-chips">
                          {contact.name ? (
                            <span className="chats-page__contact-chip">{contact.name}</span>
                          ) : null}
                          {contact.email ? (
                            <span className="chats-page__contact-chip">{contact.email}</span>
                          ) : null}
                          {contact.phone ? (
                            <span className="chats-page__contact-chip">{contact.phone}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="chats-page__thread-actions">
                    {selectedSession?.agentId ? (
                      <Link
                        href={`/dashboard/agents/${selectedSession.agentId}`}
                        className="chats-page__icon-btn"
                        title="Ver agente"
                      >
                        <ExternalLink size={14} />
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="chats-page__icon-btn"
                      title="Copiar ID de sesión"
                      onClick={() => void copySessionId(selectedId)}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      className="chats-page__icon-btn"
                      title="Actualizar mensajes"
                      onClick={() => void threadQuery.refetch()}
                    >
                      <RefreshCw size={14} />
                    </button>
                    {isSelectedActive ? (
                      <button
                        type="button"
                        className="chats-page__close-btn"
                        disabled={closingId === selectedId}
                        onClick={() => {
                          const label = selectedSession?.visitorLabel || selectedId;
                          setConfirmClose({ sessionId: selectedId, label });
                        }}
                      >
                        <X size={12} />
                        Cerrar
                      </button>
                    ) : null}
                  </div>
                </header>

                <div className="chats-page__messages">
                  {showThreadSpinner ? (
                    <AiLoadingInline
                      label="Cargando mensajes…"
                      style={{ padding: '2rem 0', flex: 1 }}
                    />
                  ) : visibleMessageCount === 0 ? (
                    <div className="chats-page__empty-panel">
                      <Bot size={28} style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
                      <p style={{ margin: 0, fontSize: '0.8125rem' }}>
                        {messages.length > 0
                          ? 'Los mensajes de esta sesión no tienen contenido visible'
                          : 'Sin mensajes en esta sesión'}
                      </p>
                    </div>
                  ) : (
                    <ConversationThread key={selectedId} messages={messages} />
                  )}
                </div>

                {selectedSession ? (
                  <footer className="chats-page__stats">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <MessageSquare size={10} />
                      {visibleMessageCount} mensaje{visibleMessageCount !== 1 ? 's' : ''}
                    </span>
                    <span>
                      Inicio:{' '}
                      {new Date(selectedSession.startedAt).toLocaleString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {selectedSession.endedAt ? (
                      <span>
                        Fin:{' '}
                        {new Date(selectedSession.endedAt).toLocaleString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    ) : null}
                    {selectedSession.escalated ? <span style={{ color: '#d97706' }}>Escalado</span> : null}
                    {selectedSession.humanMode ? <span style={{ color: 'var(--primary)' }}>Modo humano</span> : null}
                    {selectedSession.agentId ? (
                      <Link
                        href={`/dashboard/agents/${selectedSession.agentId}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: 'var(--primary)',
                          textDecoration: 'none',
                        }}
                      >
                        <Bot size={10} />
                        Ver agente
                        <ChevronRight size={10} />
                      </Link>
                    ) : null}
                  </footer>
                ) : null}
              </>
            )}
          </section>
        </div>
        )}
      </div>

      {confirmClose ? (
        <ConfirmDialog
          open={!!confirmClose}
          title="Cerrar sesión de chat"
          description={`¿Cerrar el chat con ${confirmClose.label}? El visitante no podrá continuar esta sesión.`}
          confirmLabel="Cerrar chat"
          cancelLabel="Cancelar"
          onConfirm={() => void closeSession(confirmClose.sessionId)}
          onCancel={() => setConfirmClose(null)}
          loading={closingId === confirmClose.sessionId}
          variant="danger"
        />
      ) : null}
    </DashboardShell>
  );
}
