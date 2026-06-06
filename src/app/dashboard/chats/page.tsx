'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Bot,
  Circle,
  Clock,
  MessageSquare,
  RefreshCw,
  User,
  X,
  Image as ImageIcon,
  Paperclip,
} from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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

type ChatMessage = {
  id: string;
  role: string;
  sentBy: string;
  content: string;
  createdAt: string;
  attachments?: Array<{ type: string; url: string; name?: string; mime?: string }>;
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
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

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '12px 14px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        background: selected ? 'rgba(var(--brand-primary-rgb), 0.08)' : 'transparent',
        borderLeft: selected ? '3px solid var(--brand-primary)' : '3px solid transparent',
        borderBottom: '1px solid #f0f0f2',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: color.bg,
            border: `1.5px solid ${color.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 600,
            color: color.fg,
          }}
        >
          {initials(item.visitorLabel)}
        </div>
        {isActive && (
          <span
            style={{
              position: 'absolute',
              bottom: 1,
              right: 1,
              width: 9,
              height: 9,
              background: '#22c55e',
              border: '1.5px solid white',
              borderRadius: '50%',
            }}
          />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.visitorLabel}
          </span>
          <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
            {timeAgo(item.lastMessageAt || item.startedAt)}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.lastMessage || item.widgetName}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {item.widgetName && (
            <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', borderRadius: 4, padding: '1px 5px' }}>
              {item.widgetName}
            </span>
          )}
          {item.escalated && (
            <span style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '1px 5px' }}>
              Escalado
            </span>
          )}
          {item.humanMode && (
            <span style={{ fontSize: 10, color: '#1e40af', background: '#dbeafe', borderRadius: 4, padding: '1px 5px' }}>
              Humano
            </span>
          )}
          <span style={{ fontSize: 10, color: '#94a3b8' }}>
            {item.messageCount} msg
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const hasAttachments = msg.attachments && msg.attachments.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 8,
        gap: 6,
        alignItems: 'flex-end',
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginBottom: 2,
          }}
        >
          <Bot size={13} color="#64748b" />
        </div>
      )}

      <div style={{ maxWidth: '75%' }}>
        {hasAttachments && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            {msg.attachments!.map((att, i) => (
              att.type === 'image' ? (
                <a key={i} href={att.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.url}
                    alt={att.name || 'imagen'}
                    style={{ maxWidth: 160, maxHeight: 120, borderRadius: 8, objectFit: 'cover', display: 'block' }}
                  />
                </a>
              ) : (
                <a
                  key={i}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    background: '#f1f5f9',
                    borderRadius: 6,
                    fontSize: 12,
                    color: '#3b82f6',
                    textDecoration: 'none',
                  }}
                >
                  <Paperclip size={11} />
                  {att.name || 'archivo'}
                </a>
              )
            ))}
          </div>
        )}
        {msg.content && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              background: isUser ? 'var(--brand-primary, #3b82f6)' : '#f1f5f9',
              color: isUser ? 'white' : '#1e293b',
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {msg.content}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3, textAlign: isUser ? 'right' : 'left', paddingInline: 4 }}>
          {formatTime(msg.createdAt)}
          {msg.sentBy === 'human' && ' · Agente'}
        </div>
      </div>

      {isUser && (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#dbeafe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginBottom: 2,
          }}
        >
          <User size={13} color="#3b82f6" />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ChatsPage() {
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<{ sessionId: string; label: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const status = tab === 'active' ? 'active' : 'all';
      const res = await fetch(`/api/conversations?status=${status}&limit=60`);
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

  // Refresco silencioso de la lista cada 8s
  useEffect(() => {
    const id = setInterval(() => { void loadSessions(true); }, 8000);
    return () => clearInterval(id);
  }, [loadSessions]);

  const loadThread = useCallback(async (sessionId: string, silent = false) => {
    if (!silent) setLoadingThread(true);
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (!res.ok) { toast.error('Error al cargar mensajes.'); return; }
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      if (data.session) setSessionDetail(data.session as SessionDetail);
    } finally {
      if (!silent) setLoadingThread(false);
    }
  }, []);

  // Polling del hilo cada 4s mientras está seleccionado y es activo
  useEffect(() => {
    if (!selectedId) return;
    const selected = sessions.find((s) => s.sessionId === selectedId);
    if (selected?.endedAt) return; // sesión cerrada, no necesita polling
    const id = setInterval(() => { void loadThread(selectedId, true); }, 4000);
    return () => clearInterval(id);
  }, [selectedId, sessions, loadThread]);

  // Scroll al final cuando llegan mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function selectSession(sessionId: string) {
    if (sessionId === selectedId) return;
    setSelectedId(sessionId);
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
      if (!res.ok) { toast.error(typeof data.error === 'string' ? data.error : 'Error al cerrar.'); return; }
      toast.success('Sesión cerrada.');
      void loadSessions(true);
      if (selectedId === sessionId) {
        setSessionDetail((prev) => prev ? { ...prev, endedAt: data.endedAt ?? new Date().toISOString() } : prev);
      }
    } finally {
      setClosingId(null);
      setConfirmClose(null);
    }
  }

  const selectedSession = sessions.find((s) => s.sessionId === selectedId);
  const isSelectedActive = selectedSession ? !selectedSession.endedAt : false;

  return (
    <DashboardShell>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 400 }}>

        {/* Header */}
        <div style={{ padding: '0 0 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>Chats</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>
              {activeCount} sesión{activeCount !== 1 ? 'es' : ''} activa{activeCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => void loadSessions()}
            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}
          >
            <RefreshCw size={13} />
            Actualizar
          </button>
        </div>

        {/* Main layout */}
        <div style={{ flex: 1, display: 'flex', gap: 0, border: '1px solid #e8eaf0', borderRadius: 12, overflow: 'hidden', background: 'white', minHeight: 0 }}>

          {/* ── Left Panel: Session List ── */}
          <div style={{ width: 300, minWidth: 240, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e8eaf0', flexShrink: 0 }}>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e8eaf0', flexShrink: 0 }}>
              {(['active', 'all'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setSelectedId(null); }}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    fontSize: 13,
                    fontWeight: tab === t ? 600 : 400,
                    color: tab === t ? 'var(--brand-primary, #3b82f6)' : '#64748b',
                    background: 'none',
                    border: 'none',
                    borderBottom: tab === t ? '2px solid var(--brand-primary, #3b82f6)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {t === 'active' ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Circle size={7} fill="#22c55e" color="#22c55e" />
                      Activos {activeCount > 0 && <span style={{ background: '#22c55e', color: 'white', borderRadius: 8, fontSize: 10, padding: '1px 5px' }}>{activeCount}</span>}
                    </span>
                  ) : 'Todos'}
                </button>
              ))}
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Cargando...</div>
              ) : sessions.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <MessageSquare size={32} color="#cbd5e1" style={{ marginBottom: 8 }} />
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                    {tab === 'active' ? 'No hay chats activos' : 'No hay chats registrados'}
                  </p>
                </div>
              ) : (
                sessions.map((item) => (
                  <SessionCard
                    key={item.sessionId}
                    item={item}
                    selected={selectedId === item.sessionId}
                    onClick={() => selectSession(item.sessionId)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Right Panel: Messages ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {!selectedId ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: 8 }}>
                <MessageSquare size={40} color="#cbd5e1" />
                <p style={{ fontSize: 14, margin: 0 }}>Selecciona un chat para ver los mensajes</p>
              </div>
            ) : (
              <>
                {/* Thread Header */}
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #e8eaf0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                    background: '#fafbfc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ position: 'relative' }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: selectedSession ? sessionColor(selectedSession.sessionId).bg : '#e2e8f0',
                          border: `1.5px solid ${selectedSession ? sessionColor(selectedSession.sessionId).border : '#e2e8f0'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 600,
                          color: selectedSession ? sessionColor(selectedSession.sessionId).fg : '#64748b',
                        }}
                      >
                        {selectedSession ? initials(selectedSession.visitorLabel) : '?'}
                      </div>
                      {isSelectedActive && (
                        <span style={{ position: 'absolute', bottom: 1, right: 1, width: 8, height: 8, background: '#22c55e', border: '1.5px solid white', borderRadius: '50%' }} />
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
                        {sessionDetail?.visitorLabel || selectedSession?.visitorLabel || '...'}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 8 }}>
                        <span>{sessionDetail?.widgetName || selectedSession?.widgetName}</span>
                        {selectedSession && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={10} />
                            {formatDuration(selectedSession.durationSec)}
                          </span>
                        )}
                        {isSelectedActive
                          ? <span style={{ color: '#22c55e', fontWeight: 500 }}>● Activo</span>
                          : <span style={{ color: '#94a3b8' }}>● Cerrado</span>
                        }
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isSelectedActive && (
                      <button
                        onClick={() => {
                          const label = selectedSession?.visitorLabel || selectedId;
                          setConfirmClose({ sessionId: selectedId, label });
                        }}
                        disabled={closingId === selectedId}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 7,
                          border: '1px solid #fca5a5',
                          background: '#fff1f2',
                          color: '#dc2626',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <X size={12} />
                        Cerrar chat
                      </button>
                    )}
                    <button
                      onClick={() => void loadThread(selectedId)}
                      style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: '#64748b' }}
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                  {loadingThread ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 32 }}>Cargando mensajes...</div>
                  ) : messages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 32 }}>
                      <ImageIcon size={28} color="#cbd5e1" style={{ marginBottom: 8 }} />
                      <p style={{ margin: 0 }}>Sin mensajes aún</p>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg) => (
                        <MessageBubble key={msg.id} msg={msg} />
                      ))}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* Stats bar */}
                {selectedSession && (
                  <div
                    style={{
                      padding: '8px 16px',
                      borderTop: '1px solid #e8eaf0',
                      display: 'flex',
                      gap: 16,
                      fontSize: 11,
                      color: '#94a3b8',
                      flexShrink: 0,
                      background: '#fafbfc',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MessageSquare size={10} />
                      {messages.length} mensajes
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} />
                      Inicio: {new Date(selectedSession.startedAt).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {selectedSession.endedAt && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Fin: {new Date(selectedSession.endedAt).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {selectedSession.escalated && (
                      <span style={{ color: '#d97706' }}>⚠ Escalado</span>
                    )}
                    {selectedSession.humanMode && (
                      <span style={{ color: '#3b82f6' }}>👤 Modo humano</span>
                    )}
                    {selectedSession.agentId && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Bot size={10} />
                        {selectedSession.agentId.slice(-8)}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirm close dialog */}
      {confirmClose && (
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
      )}
    </DashboardShell>
  );
}
