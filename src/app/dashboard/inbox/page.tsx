'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Inbox,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';
import { InboxChatModal } from '@/components/dashboard/inbox-chat-modal';
import { InboxRequestCard, type InboxCardItem, displayVisitorName } from '@/components/dashboard/inbox-request-card';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { notifyInboxChanged } from '@/hooks/use-inbox-open-count';

type InboxItem = InboxCardItem;

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
  const [replyFilter, setReplyFilter] = useState<'unanswered' | 'answered'>('unanswered');
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

  async function silenceBot(sessionId: string) {
    setReactivatingBot(sessionId);
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ humanMode: true }),
      });
      if (res.ok) {
        setHumanModeBySession((prev) => ({ ...prev, [sessionId]: true }));
        toast.success('Tomaste el control — el bot quedó en pausa.');
      } else {
        const d = await res.json();
        toast.error(d.error || 'No se pudo pausar el bot.');
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

  const visibleItems =
    tab === 'open'
      ? items.filter((item) => (replyFilter === 'unanswered' ? item.needsReply : !item.needsReply))
      : items;

  const activeChatItem = expanded ? items.find((i) => i.sessionId === expanded) : null;

  return (
    <DashboardShell wide className="inbox-page-shell">
    <div className="inbox-page">
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
          contactName={displayVisitorName(activeChatItem)}
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
          onSilenceBot={() => void silenceBot(expanded)}
          reactivatingBot={reactivatingBot === expanded}
          isWhatsApp={expanded.startsWith('wa:')}
        />
      )}
      <h1 className="inbox-page__title">Bandeja de Entrada</h1>

      <div className="inbox-page__toolbar">
        {tab === 'open' ? (
          <div className="inbox-page__filters" role="group" aria-label="Filtrar por estado de respuesta">
            <button
              type="button"
              className={`inbox-page__filter inbox-page__filter--pending${replyFilter === 'unanswered' ? ' is-active' : ''}`}
              onClick={() => setReplyFilter('unanswered')}
            >
              Sin responder
            </button>
            <button
              type="button"
              className={`inbox-page__filter inbox-page__filter--answered${replyFilter === 'answered' ? ' is-active' : ''}`}
              onClick={() => setReplyFilter('answered')}
            >
              Respondida
            </button>
          </div>
        ) : (
          <span />
        )}

        <div className="inbox-page__tabs" role="tablist" aria-label="Estado de conversaciones">
          {(['open', 'resolved'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`inbox-page__tab${tab === t ? ' is-active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'open' ? 'Abiertas' : 'Resueltas'}
              {t === 'open' && openCount > 0 ? (
                <span className="inbox-page__tab-badge">{openCount}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <AiLoadingInline
          label="Cargando bandeja…"
          hint="Recuperando conversaciones de tus widgets"
          style={{ padding: '48px 0' }}
        />
      ) : visibleItems.length === 0 ? (
        <div className="inbox-page__empty card-texture">
          <Inbox size={36} style={{ color: 'var(--muted-foreground)', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, margin: '0 0 6px' }}>
            {tab === 'open'
              ? replyFilter === 'unanswered'
                ? 'Sin mensajes pendientes de respuesta'
                : 'Sin conversaciones respondidas'
              : 'Sin conversaciones resueltas'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
            Cuando un visitante pida atención humana o escriba por WhatsApp, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="inbox-page__list">
          {visibleItems.map((item) => {
            const chatOpen = expanded === item.sessionId;
            const showFollowUp = followUpExpanded[item.sessionId] || Boolean(item.followUpAt);
            const visitorName = displayVisitorName(item);

            return (
              <InboxRequestCard
                key={item.sessionId}
                item={item}
                tab={tab}
                chatOpen={chatOpen}
                showFollowUp={showFollowUp}
                followUpDraft={followUpDraft[item.sessionId]}
                deleting={deletingSession === item.sessionId}
                fmtDate={fmtDate}
                onOpenChat={() => void openChat(item.sessionId, item.inboxStatus !== 'resolved')}
                onResolve={() => void setStatus(item.sessionId, 'resolved')}
                onReopen={() => void setStatus(item.sessionId, 'open')}
                onDelete={() => setDeleteTarget({ sessionId: item.sessionId, label: visitorName })}
                onToggleFollowUp={() =>
                  setFollowUpExpanded((prev) => ({
                    ...prev,
                    [item.sessionId]: !showFollowUp,
                  }))
                }
                onFollowUpDraftChange={(patch) =>
                  setFollowUpDraft((prev) => ({
                    ...prev,
                    [item.sessionId]: {
                      at:
                        patch.at ??
                        prev[item.sessionId]?.at ??
                        (item.followUpAt ? new Date(item.followUpAt).toISOString().slice(0, 16) : ''),
                      note: patch.note ?? prev[item.sessionId]?.note ?? item.followUpNote ?? '',
                    },
                  }))
                }
                onSaveFollowUp={() => void saveFollowUp(item.sessionId)}
              />
            );
          })}
        </div>
      )}
    </div>
    </DashboardShell>
  );
}
