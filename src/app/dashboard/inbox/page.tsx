'use client';

import { useCallback, useEffect, useState } from 'react';
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
};

type TranscriptMessage = {
  role: string;
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox?status=${tab}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Error al cargar inbox.');
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setOpenCount(typeof data.openCount === 'number' ? data.openCount : 0);
      notifyInboxChanged();
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleTranscript(sessionId: string) {
    if (expanded === sessionId) {
      setExpanded(null);
      return;
    }
    setExpanded(sessionId);
    if (transcripts[sessionId]) return;
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
                      onClick={() => toggleTranscript(item.sessionId)}
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
                    {loadingTranscript === item.sessionId ? (
                      <Loader2 size={18} className="animate-spin" style={{ color: BRAND_TEXT_COLOR }} />
                    ) : msgs?.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflow: 'auto' }}>
                        {msgs.map((m, i) => (
                          <div
                            key={i}
                            style={{
                              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                              maxWidth: '85%',
                              padding: '8px 12px',
                              borderRadius: 10,
                              fontSize: 12,
                              lineHeight: 1.45,
                              background: m.role === 'user' ? 'rgba(var(--brand-primary-rgb),0.12)' : 'var(--background)',
                            }}
                          >
                            <span style={{ fontWeight: 700, fontSize: 10, display: 'block', marginBottom: 2, opacity: 0.7 }}>
                              {m.role === 'user' ? 'Usuario' : 'Bot'}
                            </span>
                            {m.content}
                            {m.attachments?.map((att, ai) =>
                              att.url ? (
                                <div key={ai} style={{ marginTop: 8 }}>
                                  <a href={att.url} target="_blank" rel="noopener noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={att.url}
                                      alt="Captura adjunta"
                                      style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }}
                                    />
                                  </a>
                                  {att.ocrText ? (
                                    <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>
                                      {att.ocrText.slice(0, 500)}
                                      {att.ocrText.length > 500 ? '…' : ''}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null,
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
                        Sin mensajes guardados para esta sesión.
                      </p>
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
