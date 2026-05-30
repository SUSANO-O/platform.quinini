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
  Paperclip,
  X,
  FileText,
  Download,
  Trash2,
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

type Attachment = {
  type: string; // 'image' | 'video' | 'file'
  url: string;
  publicId?: string;
  resourceType?: string;
  name?: string;
  mime?: string;
  bytes?: number;
  width?: number;
  height?: number;
  ocrText?: string;
};

type TranscriptMessage = {
  id?: string;
  role: string;
  sentBy?: string;
  content: string;
  createdAt: string;
  attachments?: Attachment[];
};

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Inserta fl_attachment en URLs de Cloudinary para forzar descarga. */
function cloudinaryDownloadUrl(url: string): string {
  if (/res\.cloudinary\.com/.test(url) && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/fl_attachment/');
  }
  return url;
}

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
  // Adjuntos pendientes de envío (ya subidos a Cloudinary) por sesión.
  const [pendingAttachments, setPendingAttachments] = useState<Record<string, Attachment[]>>({});
  const [uploadingAttachment, setUploadingAttachment] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
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

  async function refreshThread(sessionId: string) {
    const tr = await fetch(`/api/inbox/${encodeURIComponent(sessionId)}`);
    const td = await tr.json();
    if (tr.ok && Array.isArray(td.messages)) {
      setTranscripts((prev) => ({ ...prev, [sessionId]: td.messages }));
    }
  }

  async function sendReply(sessionId: string) {
    const message = replyDraft[sessionId]?.trim() || '';
    const attachments = pendingAttachments[sessionId] || [];
    if (!message && attachments.length === 0) return;
    setSendingReply(sessionId);
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(sessionId)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, attachments }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'No se pudo enviar el mensaje.');
        return;
      }
      setReplyDraft((prev) => ({ ...prev, [sessionId]: '' }));
      setPendingAttachments((prev) => ({ ...prev, [sessionId]: [] }));
      await refreshThread(sessionId);
      toast.success('Mensaje enviado al visitante.');
    } finally {
      setSendingReply(null);
    }
  }

  async function uploadAttachment(sessionId: string, file: File) {
    setUploadingAttachment(sessionId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/inbox/${encodeURIComponent(sessionId)}/attachment`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.attachment) {
        toast.error(data.error || 'No se pudo subir el archivo.');
        return;
      }
      setPendingAttachments((prev) => ({
        ...prev,
        [sessionId]: [...(prev[sessionId] || []), data.attachment as Attachment],
      }));
    } catch {
      toast.error('Error de red al subir el archivo.');
    } finally {
      setUploadingAttachment(null);
    }
  }

  function removePendingAttachment(sessionId: string, index: number) {
    setPendingAttachments((prev) => ({
      ...prev,
      [sessionId]: (prev[sessionId] || []).filter((_, i) => i !== index),
    }));
  }

  async function deleteMessage(sessionId: string, messageId: string) {
    if (!messageId) return;
    // Optimista: quitar del hilo.
    setTranscripts((prev) => ({
      ...prev,
      [sessionId]: (prev[sessionId] || []).filter((m) => m.id !== messageId),
    }));
    try {
      const res = await fetch(
        `/api/inbox/${encodeURIComponent(sessionId)}/message/${encodeURIComponent(messageId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'No se pudo retirar el mensaje.');
        await refreshThread(sessionId); // revertir si falló
        return;
      }
      toast.success('Mensaje retirado.');
    } catch {
      toast.error('Error de red al retirar.');
      await refreshThread(sessionId);
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
                      <ConversationThread
                        messages={msgs}
                        canDelete={item.inboxStatus !== 'resolved'}
                        onDelete={(messageId) => void deleteMessage(item.sessionId, messageId)}
                      />
                    ) : (
                      <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
                        Sin mensajes guardados para esta sesión.
                      </p>
                    )}

                    {/* Caja de respuesta — solo sesiones abiertas */}
                    {item.inboxStatus !== 'resolved' && (() => {
                      const draft = replyDraft[item.sessionId]?.trim() || '';
                      const atts = pendingAttachments[item.sessionId] || [];
                      const isUploading = uploadingAttachment === item.sessionId;
                      const isSending = sendingReply === item.sessionId;
                      const canSend = (draft.length > 0 || atts.length > 0) && !isSending && !isUploading;
                      return (
                      <div style={{ marginTop: 12 }}>
                        {/* Previews de adjuntos pendientes */}
                        {atts.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                            {atts.map((att, ai) => (
                              <div
                                key={ai}
                                style={{
                                  position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
                                  padding: att.type === 'image' ? 0 : '6px 10px 6px 8px',
                                  borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)',
                                  maxWidth: 220,
                                }}
                              >
                                {att.type === 'image' ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={att.url} alt={att.name || 'imagen'} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} />
                                ) : att.type === 'video' ? (
                                  <><MessageSquare size={16} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} /><span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name || 'video'}</span></>
                                ) : (
                                  <><FileText size={16} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} /><span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name || 'archivo'}</span></>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removePendingAttachment(item.sessionId, ai)}
                                  title="Quitar"
                                  style={{
                                    position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: 999,
                                    border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.2)',
                                  }}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                          <input
                            ref={(el) => { fileInputRefs.current[item.sessionId] = el; }}
                            type="file"
                            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void uploadAttachment(item.sessionId, f);
                              e.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            disabled={isUploading || isSending}
                            onClick={() => fileInputRefs.current[item.sessionId]?.click()}
                            title="Adjuntar imagen, video o archivo"
                            style={{
                              width: 44, height: 44, flexShrink: 0, borderRadius: 12,
                              border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--muted-foreground)',
                              cursor: isUploading || isSending ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                          </button>
                          <textarea
                            rows={2}
                            placeholder="Escribe tu respuesta al visitante…"
                            className="landing-input"
                            style={{ flex: 1, resize: 'none', fontSize: 13, lineHeight: 1.5, borderRadius: 12, padding: '10px 12px' }}
                            value={replyDraft[item.sessionId] ?? ''}
                            onChange={(e) => setReplyDraft((p) => ({ ...p, [item.sessionId]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) void sendReply(item.sessionId);
                            }}
                          />
                          <button
                            type="button"
                            disabled={!canSend}
                            onClick={() => void sendReply(item.sessionId)}
                            title="Enviar (Ctrl/⌘ + Enter)"
                            style={{
                              width: 44, height: 44, flexShrink: 0,
                              borderRadius: 12, border: 'none',
                              background: 'var(--brand-primary)', color: '#fff',
                              cursor: !canSend ? 'not-allowed' : 'pointer',
                              opacity: !canSend ? 0.45 : 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'opacity .15s',
                            }}
                          >
                            {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                          </button>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '5px 2px 0' }}>
                          <kbd style={{ fontFamily: 'inherit', fontWeight: 700 }}>Ctrl</kbd> + <kbd style={{ fontFamily: 'inherit', fontWeight: 700 }}>Enter</kbd> para enviar · 📎 imágenes, video y archivos
                        </p>
                      </div>
                      );
                    })()}
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
function ConversationThread({
  messages,
  canDelete,
  onDelete,
}: {
  messages: TranscriptMessage[];
  canDelete?: boolean;
  onDelete?: (messageId: string) => void;
}) {
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
        const onDark = isHuman; // burbuja de marca = texto claro
        const bubble: React.CSSProperties = isUser
          ? { background: '#f1f5f9', color: 'var(--foreground)' }
          : isHuman
            ? { background: 'var(--brand-primary)', color: '#fff' }
            : { background: 'rgba(15,23,42,0.05)', color: 'var(--foreground)' };
        const showDelete = canDelete && isHuman && m.id && onDelete;
        return (
          <div key={m.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3, padding: '0 4px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: isHuman ? 'var(--brand-primary)' : 'var(--muted-foreground)' }}>{label}</span>
              <span style={{ fontSize: 10, color: 'var(--muted-foreground)', opacity: 0.75 }}>{fmtTime(m.createdAt)}</span>
              {showDelete && (
                <button
                  type="button"
                  onClick={() => onDelete!(m.id!)}
                  title="Retirar mensaje (lo elimina también del chat del visitante)"
                  style={{
                    border: 'none', background: 'transparent', color: 'var(--muted-foreground)',
                    cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', opacity: 0.7,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
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
                att.url ? <AttachmentView key={ai} att={att} onDark={onDark} /> : null,
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Render de un adjunto en el hilo del inbox según su tipo. */
function AttachmentView({ att, onDark }: { att: Attachment; onDark: boolean }) {
  const top = att.url; // ya validado
  if (att.type === 'image') {
    return (
      <div style={{ marginTop: 8 }}>
        <a href={top} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={top} alt={att.name || 'imagen'} style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }} />
        </a>
        {att.ocrText ? (
          <p style={{ fontSize: 11, opacity: 0.8, margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>
            {att.ocrText.slice(0, 500)}{att.ocrText.length > 500 ? '…' : ''}
          </p>
        ) : null}
      </div>
    );
  }
  if (att.type === 'video') {
    return (
      <div style={{ marginTop: 8 }}>
        <video src={top} controls style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
      </div>
    );
  }
  // file (raw): tarjeta descargable
  const fg = onDark ? 'rgba(255,255,255,0.95)' : 'var(--foreground)';
  const sub = onDark ? 'rgba(255,255,255,0.7)' : 'var(--muted-foreground)';
  const bg = onDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.05)';
  return (
    <a
      href={cloudinaryDownloadUrl(top)}
      target="_blank"
      rel="noopener noreferrer"
      download={att.name || undefined}
      style={{
        marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
        padding: '8px 10px', borderRadius: 10, background: bg, color: fg, maxWidth: 260,
      }}
    >
      <FileText size={20} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name || 'archivo'}</span>
        {att.bytes ? <span style={{ display: 'block', fontSize: 10, color: sub }}>{formatBytes(att.bytes)}</span> : null}
      </span>
      <Download size={16} style={{ flexShrink: 0, opacity: 0.8 }} />
    </a>
  );
}
