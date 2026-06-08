'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ConversationThread, type ChatMessage } from '@/components/dashboard/inbox-chat-modal';
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

type TabKey = 'active' | 'all' | 'ended';

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
  { bg: '#e8f3f4', fg: '#006064', border: '#b2dadc' },
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

function tabStatus(tab: TabKey): string {
  if (tab === 'active') return 'active';
  if (tab === 'ended') return 'ended';
  return 'all';
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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ChatsPage() {
  const [tab, setTab] = useState<TabKey>('active');
  const [search, setSearch] = useState('');
  const [widgetFilter, setWidgetFilter] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<{ sessionId: string; label: string } | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const loadSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/conversations?status=${tabStatus(tab)}&limit=80`);
      const data = await res.json();
      if (!res.ok) {
        if (!silent) toast.error(typeof data.error === 'string' ? data.error : 'Error al cargar chats.');
        return;
      }
      setSessions(Array.isArray(data.items) ? data.items : []);
      setActiveCount(typeof data.activeCount === 'number' ? data.activeCount : 0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  useEffect(() => {
    const id = setInterval(() => { void loadSessions(true); }, 8000);
    return () => clearInterval(id);
  }, [loadSessions]);

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

  const loadThread = useCallback(async (sessionId: string, silent = false) => {
    if (!silent) setLoadingThread(true);
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (!res.ok) {
        if (!silent) toast.error('Error al cargar mensajes.');
        return;
      }
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      if (data.session) setSessionDetail(data.session as SessionDetail);
    } finally {
      if (!silent) setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const selected = sessions.find((s) => s.sessionId === selectedId);
    if (selected?.endedAt) return;
    const id = setInterval(() => { void loadThread(selectedId, true); }, 4000);
    return () => clearInterval(id);
  }, [selectedId, sessions, loadThread]);

  function selectSession(sessionId: string) {
    if (sessionId === selectedId) return;
    setSelectedId(sessionId);
    setMobileShowThread(true);
    setMessages([]);
    setSessionDetail(null);
    void loadThread(sessionId);
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
      void loadSessions(true);
      if (selectedId === sessionId) {
        setSessionDetail((prev) => (prev ? { ...prev, endedAt: data.endedAt ?? new Date().toISOString() } : prev));
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
  const isSelectedActive = selectedSession ? !selectedSession.endedAt : false;
  const contact = selectedSession?.contact ?? {};
  const showSidebar = !mobileShowThread;
  const showPanel = mobileShowThread || selectedId !== null;

  return (
    <DashboardShell wide className="chats-page-shell">
      <div className="chats-page">
        <div className="chats-page__header">
          <div>
            <h1 className="chats-page__title">Chats</h1>
            <p className="chats-page__subtitle">
              Historial de conversaciones de tus widgets · {activeCount} activa{activeCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            className="chats-page__refresh"
            onClick={() => void loadSessions()}
          >
            <RefreshCw size={13} />
            Actualizar
          </button>
        </div>

        <div className="chats-page__layout">
          {/* Lista de sesiones */}
          <aside className={`chats-page__sidebar${showSidebar ? '' : ' chats-page__sidebar--hidden-mobile'}`}>
            <div className="chats-page__tabs" role="tablist" aria-label="Filtrar chats">
              {([
                { key: 'active' as const, label: 'Activos', badge: activeCount },
                { key: 'all' as const, label: 'Todos', badge: 0 },
                { key: 'ended' as const, label: 'Cerrados', badge: 0 },
              ]).map(({ key, label, badge }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  className={`chats-page__tab${tab === key ? ' is-active' : ''}`}
                  onClick={() => {
                    setTab(key);
                    setSelectedId(null);
                    setMobileShowThread(false);
                  }}
                >
                  {key === 'active' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Circle size={7} fill="#22c55e" color="#22c55e" />
                      {label}
                      {badge > 0 ? <span className="chats-page__tab-badge">{badge}</span> : null}
                    </span>
                  ) : label}
                </button>
              ))}
            </div>

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
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: '2rem' }}
                />
              </div>
              {widgetOptions.length > 1 ? (
                <select
                  className="chats-page__widget-select"
                  value={widgetFilter}
                  onChange={(e) => setWidgetFilter(e.target.value)}
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
              {loading ? (
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
                      onClick={() => setMobileShowThread(false)}
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
                      onClick={() => void loadThread(selectedId)}
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
                  {loadingThread ? (
                    <AiLoadingInline
                      label="Cargando mensajes…"
                      style={{ padding: '2rem 0', flex: 1 }}
                    />
                  ) : messages.length === 0 ? (
                    <div className="chats-page__empty-panel">
                      <Bot size={28} style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
                      <p style={{ margin: 0, fontSize: '0.8125rem' }}>Sin mensajes en esta sesión</p>
                    </div>
                  ) : (
                    <ConversationThread messages={messages} />
                  )}
                </div>

                {selectedSession ? (
                  <footer className="chats-page__stats">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <MessageSquare size={10} />
                      {messages.length} mensajes
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
