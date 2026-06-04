'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Inbox,
  Phone,
  User,
  MessageSquare,
  CheckCircle2,
  RotateCcw,
  Loader2,
  Trash2,
  Bot,
  Headphones,
  Paperclip,
  Bell,
  ChevronDown,
  ChevronUp,
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
  lastRole: string;
  lastSentBy: string;
  lastMessageAt: string | null;
  lastHasAttachments: boolean;
  messageCount: number;
  hasUnread: boolean;
  needsReply: boolean;
  humanMode: boolean;
  visitorId: string;
  followUpAt: string | null;
  followUpNote: string;
  followUpNotified?: boolean;
};

function displayVisitorName(item: InboxItem): string {
  const name = item.contact.name?.trim();
  if (name) return name;
  const phone = item.contact.phone?.trim();
  if (phone) return phone.startsWith('+') ? phone : `+${phone}`;
  const vid = item.visitorId?.trim();
  if (vid.startsWith('wa_')) return `WhatsApp +${vid.slice(3)}`;
  if (vid) return `Visitante · ${vid.slice(0, 8)}`;
  return 'Visitante sin nombre';
}

function inboxCardStyle(item: InboxItem) {
  const base = {
    borderRadius: 14,
    padding: '14px 16px',
    transition: 'background 0.15s, border-color 0.15s',
  };
  if (item.inboxStatus === 'resolved') {
    return {
      ...base,
      ...UI_SURFACE_SECONDARY,
      opacity: 0.88,
      border: '1px solid var(--border)',
    };
  }
  if (item.needsReply) {
    return {
      ...base,
      background: item.hasUnread
        ? 'linear-gradient(135deg, rgba(254,243,199,0.7) 0%, rgba(253,230,138,0.45) 100%)'
        : 'linear-gradient(135deg, rgba(254,243,199,0.45) 0%, rgba(253,230,138,0.25) 100%)',
      border: item.hasUnread ? '1.5px solid #d97706' : '1px solid rgba(217,119,6,0.45)',
      borderLeft: '4px solid #f59e0b',
      boxShadow: item.hasUnread
        ? '0 2px 8px rgba(217,119,6,0.18)'
        : '0 1px 4px rgba(217,119,6,0.08)',
    };
  }
  return {
    ...base,
    ...UI_SURFACE_SECONDARY,
    background: 'var(--card)',
    border: '1px solid rgba(var(--brand-primary-rgb),0.15)',
  };
}

function visitorInitials(item: InboxItem): string {
  const name = item.contact.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return 'V';
}

function lastMessageAuthorLabel(item: InboxItem): { label: string; isYou: boolean; isBot: boolean } {
  if (item.lastRole === 'user') {
    return { label: displayVisitorName(item), isYou: false, isBot: false };
  }
  if (item.lastSentBy === 'human') {
    return { label: 'Tú', isYou: true, isBot: false };
  }
  return { label: 'Bot', isYou: false, isBot: true };
}

function lastMessagePreview(item: InboxItem): string {
  if (item.lastHasAttachments && !item.lastMessage.trim()) return '📎 Adjunto';
  if (item.lastMessage.trim()) return item.lastMessage.trim();
  if (item.handoffMessage.trim()) return item.handoffMessage.trim();
  return 'Sin mensajes aún';
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'ahora';
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`;
  if (diff < 172_800_000) return 'ayer';
  try {
    return new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

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
  const [humanModeBySession, setHumanModeBySession] = useState<Record<string, boolean>>({});
  const [reactivatingBot, setReactivatingBot] = useState<string | null>(null);
  const [followUpExpanded, setFollowUpExpanded] = useState<Record<string, boolean>>({});

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
      if (typeof td.session?.humanMode === 'boolean') {
        setHumanModeBySession((prev) => ({ ...prev, [sessionId]: td.session.humanMode }));
      }
    }
  }

  async function reactivateBot(sessionId: string) {
    setReactivatingBot(sessionId);
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ humanMode: false }),
      });
      if (res.ok) {
        setHumanModeBySession((prev) => ({ ...prev, [sessionId]: false }));
        toast.success('Bot reactivado — el agente retoma la conversación.');
      } else {
        const d = await res.json();
        toast.error(d.error || 'No se pudo reactivar el bot.');
      }
    } finally {
      setReactivatingBot(null);
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
      setItems((prev) =>
        prev.map((i) =>
          i.sessionId === sessionId ? { ...i, needsReply: false, hasUnread: false, lastRole: 'assistant', lastSentBy: 'human' } : i,
        ),
      );
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
    // Marcar como leída en la UI de inmediato (el servidor lo confirma al cargar el hilo).
    setItems((prev) =>
      prev.map((i) => (i.sessionId === sessionId ? { ...i, hasUnread: false } : i)),
    );
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
          humanMode={humanModeBySession[expanded] ?? false}
          onReactivateBot={() => void reactivateBot(expanded)}
          reactivatingBot={reactivatingBot === expanded}
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
          <p style={{ color: 'var(--muted-foreground)', fontSize: 14, margin: '0 0 10px' }}>
            Solicitudes de atención humana desde tus widgets.
          </p>
          {tab === 'open' && items.some((i) => i.needsReply) && (
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted-foreground)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(135deg, #fef3c7, #fde68a)', border: '1px solid #f59e0b', borderLeft: '3px solid #f59e0b' }} />
                Sin responder
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--card)', border: '1px solid var(--border)' }} />
                Respondida
              </span>
            </div>
          )}
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
            const visitorName = displayVisitorName(item);
            const author = lastMessageAuthorLabel(item);
            const preview = lastMessagePreview(item);
            const activityAt = item.lastMessageAt || item.handoffAt;
            const showFollowUp = followUpExpanded[item.sessionId] || Boolean(item.followUpAt);
            const handoffIsPreview =
              !item.lastMessage.trim() &&
              Boolean(item.handoffMessage.trim()) &&
              preview === item.handoffMessage.trim();

            return (
              <div
                key={item.sessionId}
                style={inboxCardStyle(item)}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {/* Avatar */}
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 14,
                      background: item.needsReply
                        ? item.hasUnread
                          ? 'rgba(245,158,11,0.25)'
                          : 'rgba(245,158,11,0.15)'
                        : item.hasUnread
                          ? 'rgba(var(--brand-primary-rgb),0.18)'
                          : 'var(--muted)',
                      color: item.needsReply ? '#b45309' : item.hasUnread ? 'var(--brand-primary)' : 'var(--muted-foreground)',
                      position: 'relative',
                    }}
                  >
                    {visitorInitials(item)}
                    {item.hasUnread && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: '#ef4444',
                          border: '2px solid var(--card)',
                        }}
                      />
                    )}
                  </div>

                  {/* Contenido principal */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <p style={{ fontWeight: item.needsReply || item.hasUnread ? 800 : 700, fontSize: 15, margin: 0 }}>
                            {visitorName}
                          </p>
                          {item.needsReply && item.inboxStatus !== 'resolved' && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 999,
                                background: '#f59e0b',
                                color: '#fff',
                                letterSpacing: '0.02em',
                              }}
                            >
                              Sin responder
                            </span>
                          )}
                          {item.humanMode && item.inboxStatus !== 'resolved' && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: 999,
                                background: 'rgba(34,197,94,0.15)',
                                color: '#16a34a',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                              }}
                            >
                              <Headphones size={10} />
                              En vivo
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
                          {item.widgetName}
                          {item.contact.email && ` · ${item.contact.email}`}
                          {!item.contact.email && item.contact.phone && ` · ${item.contact.phone}`}
                        </p>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          color: item.hasUnread ? 'var(--brand-primary)' : 'var(--muted-foreground)',
                          fontWeight: item.hasUnread ? 700 : 400,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                        title={fmtDate(activityAt)}
                      >
                        {relativeTime(activityAt)}
                      </span>
                    </div>

                    {/* Preview del último mensaje */}
                    <div
                      style={{
                        marginTop: 8,
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: `1px solid ${item.needsReply ? 'rgba(245,158,11,0.35)' : author.isYou ? 'rgba(var(--brand-primary-rgb),0.2)' : 'var(--border)'}`,
                        background: item.needsReply ? 'rgba(255,255,255,0.65)' : 'var(--card)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        {author.isBot ? (
                          <Bot size={11} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                        ) : author.isYou ? (
                          <User size={11} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
                        ) : (
                          <MessageSquare size={11} style={{ color: '#16a34a', flexShrink: 0 }} />
                        )}
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: author.isYou
                              ? 'var(--brand-primary)'
                              : author.isBot
                                ? 'var(--muted-foreground)'
                                : '#16a34a',
                          }}
                        >
                          {author.label}
                        </span>
                        {item.lastHasAttachments && (
                          <Paperclip size={10} style={{ color: 'var(--muted-foreground)' }} />
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: 13,
                          margin: 0,
                          lineHeight: 1.4,
                          color: 'var(--foreground)',
                          fontWeight: item.hasUnread && !author.isYou ? 600 : 400,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {preview}
                      </p>
                    </div>

                    {/* Motivo de escalación (si es distinto del último mensaje) */}
                    {item.handoffMessage && !handoffIsPreview && (
                      <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '6px 0 0', lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 700 }}>Motivo: </span>
                        {item.handoffMessage.length > 120
                          ? `${item.handoffMessage.slice(0, 120)}…`
                          : item.handoffMessage}
                      </p>
                    )}

                    {/* Contacto adicional si no está en la línea superior */}
                    {!item.contact.email && !item.contact.phone && (
                      <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <User size={11} /> Sin datos de contacto
                      </p>
                    )}
                    {item.contact.email && item.contact.phone && (
                      <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={11} /> {item.contact.phone}
                      </p>
                    )}

                    {/* Recordatorio colapsable */}
                    {tab === 'open' && (
                      <div style={{ marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() =>
                            setFollowUpExpanded((prev) => ({
                              ...prev,
                              [item.sessionId]: !showFollowUp,
                            }))
                          }
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: 0,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--muted-foreground)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <Bell size={11} />
                          {item.followUpAt ? `Recordatorio: ${fmtDate(item.followUpAt)}` : 'Agregar recordatorio'}
                          {showFollowUp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                        {showFollowUp && (
                          <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)' }}>
                            {item.followUpNote && (
                              <p style={{ fontSize: 12, margin: '0 0 8px', color: BRAND_TEXT_COLOR }}>
                                {item.followUpNote}
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
                    )}

                    {/* Acciones */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={() => void openChat(item.sessionId, item.inboxStatus !== 'resolved')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 14px',
                          borderRadius: 10,
                          border: chatOpen
                            ? '1px solid rgba(var(--brand-primary-rgb),0.45)'
                            : '1px solid rgba(var(--brand-primary-rgb),0.22)',
                          background: chatOpen
                            ? 'rgba(var(--brand-primary-rgb),0.14)'
                            : item.hasUnread
                              ? 'rgba(var(--brand-primary-rgb),0.12)'
                              : 'rgba(var(--brand-primary-rgb),0.07)',
                          color: 'var(--brand-primary)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <MessageSquare size={14} />
                        {item.hasUnread ? 'Responder' : 'Chat'}
                        {item.needsReply && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              minWidth: 18,
                              height: 18,
                              padding: '0 5px',
                              borderRadius: 999,
                              background: '#ef4444',
                              color: '#fff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            !
                          </span>
                        )}
                        {!item.needsReply && item.messageCount > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              minWidth: 18,
                              height: 18,
                              padding: '0 5px',
                              borderRadius: 999,
                              background: item.hasUnread ? '#ef4444' : 'var(--brand-primary)',
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
                        disabled={deletingSession === item.sessionId}
                        onClick={() => setDeleteTarget({ sessionId: item.sessionId, label: visitorName })}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
