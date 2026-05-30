'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Inbox,
  Mail,
  Phone,
  User,
  MessageSquare,
  CheckCircle2,
  RotateCcw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
  UserCheck,
} from 'lucide-react';
import { BRAND_TEXT_COLOR, UI_SURFACE_SECONDARY } from '@/lib/brand';
import { notifyInboxChanged } from '@/hooks/use-inbox-open-count';

type InboxItem = {
  sessionId: string;
  widgetId: string;
  widgetName: string;
  handoffAt: string;
  inboxStatus: string;
  contact: { name?: string; email?: string; phone?: string };
  handoffMessage: string;
  lastMessage: string;
  messageCount: number;
  followUpAt: string | null;
  followUpNote: string;
  followUpNotified?: boolean;
};

type TranscriptMessage = {
  role: string;
  sentBy?: string;
  content: string;
  createdAt: string;
  attachments?: Array<{ type: string; url: string; ocrText?: string }>;
};

export default function InboxPage() {
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptMessage[]>>({});
  const [loadingTranscript, setLoadingTranscript] = useState<string | null>(null);
  const [followUpDraft, setFollowUpDraft] = useState<Record<string, { at: string; note: string }>>({});
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState<string | null>(null);
  // Polling del hilo mientras una sesión está expandida y abierta.
  const [livePolling, setLivePolling] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/inbox?status=${tab}`);
      const data = await res.json();
      if (!res.ok) {
        if (!silent) toast.error(typeof data.error === 'string' ? data.error : 'Error al cargar inbox.');
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setOpenCount(typeof data.openCount === 'number' ? data.openCount : 0);
      notifyInboxChanged();
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  // Inbox reactivo: refresca la lista en segundo plano cada 8s (sin spinner).
  useEffect(() => {
    const id = setInterval(() => { void load(true); }, 8000);
    return () => clearInterval(id);
  }, [load]);

  // Polling del hilo cada 4s mientras la sesión está expandida y abierta.
  useEffect(() => {
    if (!livePolling) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/inbox/${encodeURIComponent(livePolling)}`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.messages)) {
          setTranscripts((prev) => ({ ...prev, [livePolling]: data.messages }));
        }
      } catch { /* silencioso */ }
    }, 4000);
    return () => clearInterval(id);
  }, [livePolling]);

  async function sendReply(sessionId: string) {
    const message = replyDraft[sessionId]?.trim();
    if (!message) return;
    setSendingReply(sessionId);
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(sessionId)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'No se pudo enviar el mensaje.');
        return;
      }
      setReplyDraft((prev) => ({ ...prev, [sessionId]: '' }));
      // Refrescar el hilo inmediatamente.
      const tr = await fetch(`/api/inbox/${encodeURIComponent(sessionId)}`);
      const td = await tr.json();
      if (tr.ok && Array.isArray(td.messages)) {
        setTranscripts((prev) => ({ ...prev, [sessionId]: td.messages }));
      }
      toast.success('Mensaje enviado al visitante.');
    } finally {
      setSendingReply(null);
    }
  }

  async function toggleTranscript(sessionId: string, isOpen: boolean) {
    if (expanded === sessionId) {
      setExpanded(null);
      setLivePolling(null);
      return;
    }
    setExpanded(sessionId);
    // Activar polling en vivo solo para sesiones abiertas.
    setLivePolling(isOpen ? sessionId : null);
    setLoadingTranscript(sessionId);
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.messages)) {
        setTranscripts((prev) => ({ ...prev, [sessionId]: data.messages }));
      }
    } finally {
      setLoadingTranscript(null);
    }
  }

  async function setStatus(sessionId: string, inboxStatus: 'open' | 'resolved') {
    const res = await fetch('/api/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, inboxStatus }),
    });
    if (!res.ok) {
      toast.error('No se pudo actualizar la sesión.');
      return;
    }
    toast.success(inboxStatus === 'resolved' ? 'Marcada como resuelta' : 'Reabierta');
    notifyInboxChanged();
    load();
  }

  async function saveFollowUp(sessionId: string) {
    const draft = followUpDraft[sessionId];
    const res = await fetch('/api/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        followUpAt: draft?.at ? new Date(draft.at).toISOString() : null,
        followUpNote: draft?.note ?? '',
      }),
    });
    if (!res.ok) {
      toast.error('No se pudo guardar el recordatorio.');
      return;
    }
    toast.success('Recordatorio guardado.');
    load();
  }

  function fmtDate(iso: string) {
    try {
      return new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Inbox size={22} style={{ color: BRAND_TEXT_COLOR }} />
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Inbox</h1>
            {openCount > 0 && tab === 'open' && (
              <span style={{
                background: BRAND_TEXT_COLOR,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
              }}>
                {openCount}
              </span>
            )}
          </div>
          <p style={{ color: 'var(--muted-foreground)', fontSize: 14, margin: 0 }}>
            Solicitudes de atención humana desde tus widgets.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['open', 'resolved'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: `1px solid ${tab === t ? BRAND_TEXT_COLOR : 'var(--border)'}`,
                background: tab === t ? 'rgba(var(--brand-primary-rgb),0.1)' : 'var(--card)',
                color: tab === t ? BRAND_TEXT_COLOR : 'var(--foreground)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {t === 'open' ? 'Abiertas' : 'Resueltas'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} className="animate-spin" style={{ color: BRAND_TEXT_COLOR }} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ ...UI_SURFACE_SECONDARY, borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
          <Inbox size={36} style={{ color: 'var(--muted-foreground)', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, margin: '0 0 6px' }}>
            {tab === 'open' ? 'Sin solicitudes pendientes' : 'Sin conversaciones resueltas'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
            Cuando un visitante pulse &quot;Hablar con una persona&quot; en el widget, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => {
            const isExpanded = expanded === item.sessionId;
            const msgs = transcripts[item.sessionId];
            return (
              <div
                key={item.sessionId}
                style={{
                  ...UI_SURFACE_SECONDARY,
                  borderRadius: 14,
                  padding: '16px 18px',
                  border: item.inboxStatus === 'resolved' ? '1px solid var(--border)' : '1px solid rgba(var(--brand-primary-rgb),0.25)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, margin: '0 0 4px' }}>
                      {item.contact.name || 'Visitante sin nombre'}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '0 0 8px' }}>
                      {item.widgetName} · {fmtDate(item.handoffAt)}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12 }}>
                      {item.contact.email && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Mail size={12} /> {item.contact.email}
                        </span>
                      )}
                      {item.contact.phone && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Phone size={12} /> {item.contact.phone}
                        </span>
                      )}
                      {!item.contact.email && !item.contact.phone && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted-foreground)' }}>
                          <User size={12} /> Sin datos de contacto
                        </span>
                      )}
                    </div>
                    {item.handoffMessage && (
                      <p style={{ fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
                        <MessageSquare size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                        {item.handoffMessage}
                      </p>
                    )}
                    {item.lastMessage && !item.handoffMessage && (
                      <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '8px 0 0', fontStyle: 'italic' }}>
                        Último mensaje: {item.lastMessage}
                      </p>
                    )}
                    {tab === 'open' && (
                      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, margin: '0 0 8px', color: 'var(--muted-foreground)' }}>
                          Recordatorio (seguimiento)
                        </p>
                        {item.followUpAt && (
                          <p style={{ fontSize: 12, margin: '0 0 8px', color: BRAND_TEXT_COLOR }}>
                            Programado: {fmtDate(item.followUpAt)}
                            {item.followUpNote ? ` — ${item.followUpNote}` : ''}
                          </p>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                          <input
                            type="datetime-local"
                            value={
                              followUpDraft[item.sessionId]?.at ??
                              (item.followUpAt
                                ? new Date(item.followUpAt).toISOString().slice(0, 16)
                                : '')
                            }
                            onChange={(e) =>
                              setFollowUpDraft((prev) => ({
                                ...prev,
                                [item.sessionId]: {
                                  at: e.target.value,
                                  note: prev[item.sessionId]?.note ?? item.followUpNote ?? '',
                                },
                              }))
                            }
                            style={{ fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
                          />
                          <input
                            type="text"
                            placeholder="Nota breve"
                            value={followUpDraft[item.sessionId]?.note ?? item.followUpNote ?? ''}
                            onChange={(e) =>
                              setFollowUpDraft((prev) => ({
                                ...prev,
                                [item.sessionId]: {
                                  at:
                                    prev[item.sessionId]?.at ??
                                    (item.followUpAt
                                      ? new Date(item.followUpAt).toISOString().slice(0, 16)
                                      : ''),
                                  note: e.target.value,
                                },
                              }))
                            }
                            style={{ flex: 1, minWidth: 140, fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
                          />
                          <button
                            type="button"
                            onClick={() => void saveFollowUp(item.sessionId)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: 'none',
                              background: BRAND_TEXT_COLOR,
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    {item.inboxStatus !== 'resolved' ? (
                      <button
                        type="button"
                        onClick={() => setStatus(item.sessionId, 'resolved')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '7px 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#22c55e',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <CheckCircle2 size={14} />
                        Resolver
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStatus(item.sessionId, 'open')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '7px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <RotateCcw size={14} />
                        Reabrir
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleTranscript(item.sessionId, item.inboxStatus !== 'resolved')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'transparent',
                        color: BRAND_TEXT_COLOR,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Transcript ({item.messageCount})
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    {/* Badge "EN VIVO" — modo humano activo */}
                    {item.inboxStatus !== 'resolved' && (
                      <div
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '7px 12px',
                          borderRadius: 10, background: 'rgba(var(--brand-primary-rgb),0.08)',
                          border: '1px solid rgba(var(--brand-primary-rgb),0.18)',
                        }}
                      >
                        <span style={{ position: 'relative', display: 'flex', width: 8, height: 8 }}>
                          <span className="animate-ping" style={{ position: 'absolute', inset: 0, borderRadius: 9999, background: '#22c55e', opacity: 0.6 }} />
                          <span style={{ position: 'relative', width: 8, height: 8, borderRadius: 9999, background: '#22c55e' }} />
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', color: '#16a34a' }}>EN VIVO</span>
                        <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                          Tus respuestas llegan al chat del visitante al instante.
                        </span>
                      </div>
                    )}

                    {loadingTranscript === item.sessionId ? (
                      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--brand-primary)' }}>
                        <Loader2 size={16} className="animate-spin" /> Cargando conversación…
                      </div>
                    ) : msgs?.length ? (
                      <ConversationThread messages={msgs} />
                    ) : (
                      <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
                        Sin mensajes guardados para esta sesión.
                      </p>
                    )}

                    {/* Caja de respuesta — solo sesiones abiertas */}
                    {item.inboxStatus !== 'resolved' && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                          <textarea
                            rows={2}
                            placeholder="Escribe tu respuesta al visitante…"
                            className="landing-input"
                            style={{ flex: 1, resize: 'none', fontSize: 13, lineHeight: 1.5, borderRadius: 12, padding: '10px 12px' }}
                            value={replyDraft[item.sessionId] ?? ''}
                            onChange={(e) => setReplyDraft((p) => ({ ...p, [item.sessionId]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void sendReply(item.sessionId);
                            }}
                          />
                          <button
                            type="button"
                            disabled={!replyDraft[item.sessionId]?.trim() || sendingReply === item.sessionId}
                            onClick={() => void sendReply(item.sessionId)}
                            title="Enviar (Ctrl/⌘ + Enter)"
                            style={{
                              width: 44, height: 44, flexShrink: 0,
                              borderRadius: 12, border: 'none',
                              background: 'var(--brand-primary)', color: '#fff',
                              cursor: !replyDraft[item.sessionId]?.trim() || sendingReply === item.sessionId ? 'not-allowed' : 'pointer',
                              opacity: !replyDraft[item.sessionId]?.trim() || sendingReply === item.sessionId ? 0.45 : 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'opacity .15s',
                            }}
                          >
                            {sendingReply === item.sessionId ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                          </button>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '5px 2px 0' }}>
                          <kbd style={{ fontFamily: 'inherit', fontWeight: 700 }}>Ctrl</kbd> + <kbd style={{ fontFamily: 'inherit', fontWeight: 700 }}>Enter</kbd> para enviar
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Hilo de conversación estilo chat, con auto-scroll al último mensaje. */
function ConversationThread({ messages }: { messages: TranscriptMessage[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={ref}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', padding: '4px 2px' }}
    >
      {messages.map((m, i) => {
        const isUser = m.role === 'user';
        const isHuman = m.sentBy === 'human';
        // Visitante → izquierda. Bot y Agente (lado del negocio) → derecha.
        const right = !isUser;
        const label = isUser ? 'Visitante' : isHuman ? 'Tú · Agente' : 'Bot';
        const bubble: React.CSSProperties = isUser
          ? { background: '#f1f5f9', color: 'var(--foreground)' }
          : isHuman
            ? { background: 'var(--brand-primary)', color: '#fff' }
            : { background: 'rgba(15,23,42,0.05)', color: 'var(--foreground)' };
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3, padding: '0 4px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: isHuman ? 'var(--brand-primary)' : 'var(--muted-foreground)' }}>{label}</span>
              <span style={{ fontSize: 10, color: 'var(--muted-foreground)', opacity: 0.75 }}>{fmtTime(m.createdAt)}</span>
            </div>
            <div
              style={{
                maxWidth: '85%', padding: '9px 13px', borderRadius: 14, fontSize: 13, lineHeight: 1.5,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                borderBottomRightRadius: right ? 4 : 14,
                borderBottomLeftRadius: right ? 14 : 4,
                ...bubble,
              }}
            >
              {m.content}
              {m.attachments?.map((att, ai) =>
                att.url ? (
                  <div key={ai} style={{ marginTop: 8 }}>
                    <a href={att.url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={att.url} alt="Captura adjunta" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
                    </a>
                    {att.ocrText ? (
                      <p style={{ fontSize: 11, opacity: 0.8, margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>
                        {att.ocrText.slice(0, 500)}{att.ocrText.length > 500 ? '…' : ''}
                      </p>
                    ) : null}
                  </div>
                ) : null,
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
