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
  Trash2,
} from 'lucide-react';
import { BRAND_TEXT_COLOR, UI_SURFACE_SECONDARY } from '@/lib/brand';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';
import { InboxChatModal } from '@/components/dashboard/inbox-chat-modal';
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
  deliveredAt?: string | null;
  readAt?: string | null;
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
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ sessionId: string; label: string } | null>(null);
  // Adjuntos pendientes de envío (ya subidos a Cloudinary) por sesión.
  const [pendingAttachments, setPendingAttachments] = useState<Record<string, Attachment[]>>({});
  const [uploadingAttachment, setUploadingAttachment] = useState<string | null>(null);
  // Polling del hilo mientras el modal de chat está abierto en una sesión activa.
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

  function closeChat() {
    setExpanded(null);
    setLivePolling(null);
  }

  async function openChat(sessionId: string, isOpen: boolean) {
    setExpanded(sessionId);
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

  const activeChatItem = expanded ? items.find((i) => i.sessionId === expanded) : undefined;

  async function confirmDeleteSession() {
    if (!deleteTarget) return;
    const { sessionId } = deleteTarget;
    setDeletingSession(sessionId);
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'No se pudo eliminar la conversación.');
        return;
      }
      if (expanded === sessionId) {
        setExpanded(null);
        setLivePolling(null);
      }
      setTranscripts((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      setDeleteTarget(null);
      toast.success('Conversación eliminada.');
      notifyInboxChanged();
      await load(true);
    } catch {
      toast.error('Error de red al eliminar.');
    } finally {
      setDeletingSession(null);
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
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar conversación"
        description={
          deleteTarget
            ? `¿Eliminar "${deleteTarget.label}"? Se borrará del inbox y se eliminarán los mensajes guardados de esta conversación (incluye adjuntos). Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        variant="danger"
        loading={deletingSession !== null}
        onConfirm={() => void confirmDeleteSession()}
        onCancel={() => { if (!deletingSession) setDeleteTarget(null); }}
      />
      {activeChatItem && expanded && (
        <InboxChatModal
          open
          onClose={closeChat}
          contactName={activeChatItem.contact.name ?? ''}
          widgetName={activeChatItem.widgetName}
          handoffAt={activeChatItem.handoffAt}
          inboxStatus={activeChatItem.inboxStatus}
          loading={loadingTranscript === expanded}
          messages={transcripts[expanded]}
          replyDraft={replyDraft[expanded] ?? ''}
          onReplyDraftChange={(value) => setReplyDraft((p) => ({ ...p, [expanded]: value }))}
          pendingAttachments={pendingAttachments[expanded] ?? []}
          onRemoveAttachment={(index) => removePendingAttachment(expanded, index)}
          onUploadAttachment={(file) => void uploadAttachment(expanded, file)}
          uploadingAttachment={uploadingAttachment === expanded}
          sendingReply={sendingReply === expanded}
          onSendReply={() => void sendReply(expanded)}
          onDeleteMessage={(messageId) => void deleteMessage(expanded, messageId)}
        />
      )}
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
        <AiLoadingInline
          label="Cargando inbox…"
          hint="Recuperando solicitudes de atención humana"
          style={{ padding: '48px 0' }}
        />
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
            const chatOpen = expanded === item.sessionId;
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
                      onClick={() => void openChat(item.sessionId, item.inboxStatus !== 'resolved')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 12px',
                        borderRadius: 10,
                        border: chatOpen
                          ? '1px solid rgba(var(--brand-primary-rgb),0.45)'
                          : '1px solid rgba(var(--brand-primary-rgb),0.22)',
                        background: chatOpen
                          ? 'rgba(var(--brand-primary-rgb),0.14)'
                          : 'rgba(var(--brand-primary-rgb),0.07)',
                        color: 'var(--brand-primary)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <MessageSquare size={14} />
                      Chat
                      {item.messageCount > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            minWidth: 18,
                            height: 18,
                            padding: '0 5px',
                            borderRadius: 999,
                            background: 'var(--brand-primary)',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {item.messageCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={deletingSession === item.sessionId}
                      onClick={() => setDeleteTarget({ sessionId: item.sessionId, label: item.contact.name || 'Visitante sin nombre' })}
                      title="Eliminar conversación y mensajes guardados"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(239,68,68,0.35)',
                        background: 'transparent',
                        color: '#ef4444',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: deletingSession === item.sessionId ? 'not-allowed' : 'pointer',
                        opacity: deletingSession === item.sessionId ? 0.6 : 1,
                      }}
                    >
                      {deletingSession === item.sessionId ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
