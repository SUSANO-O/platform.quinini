'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Inbox,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header';
import { BackgroundRefreshIndicator } from '@/components/dashboard/background-refresh-indicator';
import { InboxChatModal } from '@/components/dashboard/inbox-chat-modal';
import type { ChatMessage } from '@/components/dashboard/inbox-chat-modal';
import { InboxRequestCard, type InboxCardItem, displayVisitorName } from '@/components/dashboard/inbox-request-card';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { notifyInboxChanged } from '@/hooks/use-inbox-open-count';
import { dashboardKeys } from '@/lib/dashboard-query-keys';
import { fetchInboxList, fetchInboxThread, type InboxListResult } from '@/lib/dashboard-fetch';
import { useDashboardUiStore } from '@/stores/dashboard-ui-store';

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

export default function InboxPage() {
  const queryClient = useQueryClient();
  const tab = useDashboardUiStore((s) => s.inbox.tab);
  const replyFilter = useDashboardUiStore((s) => s.inbox.replyFilter);
  const expanded = useDashboardUiStore((s) => s.inbox.expandedSessionId);
  const livePolling = useDashboardUiStore((s) => s.inbox.livePollingSessionId);
  const replyDrafts = useDashboardUiStore((s) => s.inbox.replyDrafts);
  const setInboxTab = useDashboardUiStore((s) => s.setInboxTab);
  const setInboxReplyFilter = useDashboardUiStore((s) => s.setInboxReplyFilter);
  const openInboxChat = useDashboardUiStore((s) => s.openInboxChat);
  const closeInboxChat = useDashboardUiStore((s) => s.closeInboxChat);
  const setInboxReplyDraft = useDashboardUiStore((s) => s.setInboxReplyDraft);
  const clearInboxReplyDraft = useDashboardUiStore((s) => s.clearInboxReplyDraft);
  const [followUpDraft, setFollowUpDraft] = useState<Record<string, { at: string; note: string }>>({});
  const [sendingReply, setSendingReply] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ sessionId: string; label: string } | null>(null);
  // Adjuntos pendientes de envío (ya subidos a Cloudinary) por sesión.
  const [pendingAttachments, setPendingAttachments] = useState<Record<string, Attachment[]>>({});
  const [uploadingAttachment, setUploadingAttachment] = useState<string | null>(null);
  const [humanModeBySession, setHumanModeBySession] = useState<Record<string, boolean>>({});
  const [reactivatingBot, setReactivatingBot] = useState<string | null>(null);
  const [followUpExpanded, setFollowUpExpanded] = useState<Record<string, boolean>>({});
  /** Fuerza remount del composer tras envío (Grammarly/extensiones a veces dejan el textarea pegado). */
  const [composerResetKey, setComposerResetKey] = useState(0);

  const inboxQuery = useQuery({
    queryKey: dashboardKeys.inbox(tab),
    queryFn: () => fetchInboxList(tab),
    refetchInterval: 8000,
  });

  const items = inboxQuery.data?.items ?? [];
  const openCount = inboxQuery.data?.openCount ?? 0;
  const showListSpinner = inboxQuery.isLoading && items.length === 0;

  useEffect(() => {
    if (inboxQuery.isSuccess) notifyInboxChanged();
  }, [inboxQuery.isSuccess, inboxQuery.dataUpdatedAt]);

  const threadQuery = useQuery({
    queryKey: dashboardKeys.inboxThread(expanded ?? ''),
    queryFn: () => fetchInboxThread(expanded!),
    enabled: Boolean(expanded),
    refetchInterval: livePolling ? 4000 : false,
  });

  useEffect(() => {
    if (!expanded || typeof threadQuery.data?.humanMode !== 'boolean') return;
    setHumanModeBySession((prev) => ({ ...prev, [expanded]: threadQuery.data!.humanMode }));
  }, [expanded, threadQuery.data?.humanMode]);

  async function refreshThread(sessionId: string) {
    await queryClient.invalidateQueries({ queryKey: dashboardKeys.inboxThread(sessionId) });
  }

  function patchInboxList(patch: (list: InboxListResult) => InboxListResult) {
    queryClient.setQueryData(dashboardKeys.inbox(tab), (old: InboxListResult | undefined) => {
      if (!old) return old;
      return patch(old);
    });
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
    const message = replyDrafts[sessionId]?.trim() || '';
    const attachments = [...(pendingAttachments[sessionId] || [])];
    if (!message && attachments.length === 0) return;

    // Limpiar composer al instante (UX: no dejar texto/adjuntos pegados mientras envía).
    clearInboxReplyDraft(sessionId);
    setPendingAttachments((prev) => ({ ...prev, [sessionId]: [] }));
    setComposerResetKey((k) => k + 1);

    setSendingReply(sessionId);
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(sessionId)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, attachments }),
      });
      const data = await res.json().catch(() => ({})) as {
        error?: string;
        messageId?: string;
        attachments?: Attachment[];
      };
      if (!res.ok) {
        setInboxReplyDraft(sessionId, message);
        setPendingAttachments((prev) => ({ ...prev, [sessionId]: attachments }));
        toast.error(data.error || 'No se pudo enviar el mensaje.');
        return;
      }

      const optimisticMsg: ChatMessage = {
        id: typeof data.messageId === 'string' ? data.messageId : `tmp-${Date.now()}`,
        role: 'assistant',
        sentBy: 'human',
        content: message,
        createdAt: new Date().toISOString(),
        attachments: Array.isArray(data.attachments) && data.attachments.length
          ? data.attachments
          : attachments.length
            ? attachments
            : undefined,
      };
      queryClient.setQueryData(
        dashboardKeys.inboxThread(sessionId),
        (old: Awaited<ReturnType<typeof fetchInboxThread>> | undefined) => {
          if (!old) return old;
          const exists = optimisticMsg.id && old.messages.some((m) => m.id === optimisticMsg.id);
          if (exists) return old;
          return { ...old, messages: [...old.messages, optimisticMsg] };
        },
      );

      patchInboxList((old) => ({
        ...old,
        items: old.items.map((i) =>
          i.sessionId === sessionId
            ? { ...i, needsReply: false, hasUnread: false, lastRole: 'assistant', lastSentBy: 'human' }
            : i,
        ),
      }));
      void refreshThread(sessionId);
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
    queryClient.setQueryData(dashboardKeys.inboxThread(sessionId), (old: Awaited<ReturnType<typeof fetchInboxThread>> | undefined) => {
      if (!old) return old;
      return { ...old, messages: old.messages.filter((m) => m.id !== messageId) };
    });
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
    closeInboxChat();
  }

  function openChat(sessionId: string, isOpen: boolean) {
    openInboxChat(sessionId, isOpen);
    patchInboxList((old) => ({
      ...old,
      items: old.items.map((i) => (i.sessionId === sessionId ? { ...i, hasUnread: false } : i)),
    }));
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
        closeInboxChat();
      }
      queryClient.removeQueries({ queryKey: dashboardKeys.inboxThread(sessionId) });
      setDeleteTarget(null);
      toast.success('Conversación eliminada.');
      notifyInboxChanged();
      await queryClient.invalidateQueries({ queryKey: dashboardKeys.inbox(tab) });
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
    const data = await res.json().catch(() => ({})) as { error?: string; channel?: string; messageSent?: boolean };
    if (!res.ok) {
      toast.error(typeof data.error === 'string' ? data.error : 'No se pudo actualizar la sesión.');
      return;
    }
    if (inboxStatus === 'resolved') {
      if (data.channel === 'whatsapp' && data.messageSent) {
        toast.success('Conversación cerrada y mensaje enviado por WhatsApp.');
      } else {
        toast.success('Conversación cerrada. El visitante verá el mensaje de despedida.');
      }
      if (expanded === sessionId) {
        closeInboxChat();
      }
    } else {
      toast.success('Reabierta');
    }
    notifyInboxChanged();
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.inbox(tab) });
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
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.inbox(tab) });
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
    <DashboardShell width="wide" className="inbox-page-shell">
    <div className="inbox-page dashboard-page-stack">
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
          loading={Boolean(expanded) && threadQuery.isLoading && !threadQuery.data}
          messages={threadQuery.data?.messages}
          replyDraft={replyDrafts[expanded] ?? ''}
          onReplyDraftChange={(value) => setInboxReplyDraft(expanded, value)}
          pendingAttachments={pendingAttachments[expanded] ?? []}
          onRemoveAttachment={(index) => removePendingAttachment(expanded, index)}
          onUploadAttachment={(file) => void uploadAttachment(expanded, file)}
          uploadingAttachment={uploadingAttachment === expanded}
          sendingReply={sendingReply === expanded}
          onSendReply={() => void sendReply(expanded)}
          onDeleteMessage={(messageId) => void deleteMessage(expanded, messageId)}
          humanMode={humanModeBySession[expanded] ?? activeChatItem.humanMode ?? false}
          onReactivateBot={() => void reactivateBot(expanded)}
          onSilenceBot={() => void silenceBot(expanded)}
          reactivatingBot={reactivatingBot === expanded}
          isWhatsApp={expanded.startsWith('wa:')}
          composerResetKey={composerResetKey}
        />
      )}
      <DashboardPageHeader
        badge="Bandeja"
        badgeIcon={Inbox}
        title="Entrada"
        description="Conversaciones de widgets y WhatsApp que requieren tu atención."
        compact
        hideIcon
        actions={<BackgroundRefreshIndicator active={inboxQuery.isFetching && !showListSpinner} />}
      />

      <div className="inbox-page__toolbar">
        {tab === 'open' ? (
          <div className="inbox-page__filters" role="group" aria-label="Filtrar por estado de respuesta">
            <button
              type="button"
              className={`inbox-page__filter inbox-page__filter--pending${replyFilter === 'unanswered' ? ' is-active' : ''}`}
              onClick={() => setInboxReplyFilter('unanswered')}
            >
              Sin responder
            </button>
            <button
              type="button"
              className={`inbox-page__filter inbox-page__filter--answered${replyFilter === 'answered' ? ' is-active' : ''}`}
              onClick={() => setInboxReplyFilter('answered')}
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
              onClick={() => setInboxTab(t)}
            >
              {t === 'open' ? 'Abiertas' : 'Resueltas'}
              {t === 'open' && openCount > 0 ? (
                <span className="inbox-page__tab-badge">{openCount}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {showListSpinner ? (
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
