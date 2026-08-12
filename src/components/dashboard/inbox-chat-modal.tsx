'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, FileText, Loader2, MessageSquare, Paperclip, Send, Trash2, User, X, Download, Check, CheckCheck, Bot, Headphones,
} from '@/components/ui/icons';

export type ChatAttachment = {
  type: string;
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

export type ChatMessage = {
  id?: string;
  role: string;
  sentBy?: string;
  content: string;
  createdAt: string;
  attachments?: ChatAttachment[];
  deliveredAt?: string | null;
  readAt?: string | null;
};

/** Acuse de recibo estilo WhatsApp para mensajes del agente humano. */
function ReadReceipt({ m }: { m: ChatMessage }) {
  const read = !!m.readAt;
  const delivered = !!m.deliveredAt;
  const label = read ? 'Visto' : delivered ? 'Recibido' : 'Enviado';
  return (
    <div
      className="flex items-center gap-1 mt-1 px-1 text-[10px]"
      style={{ color: read ? '#16a34a' : 'var(--muted-foreground)' }}
      title={label}
    >
      {read || delivered ? <CheckCheck size={13} /> : <Check size={13} />}
      <span>{label}</span>
    </div>
  );
}

type InboxChatModalProps = {
  open: boolean;
  onClose: () => void;
  contactName: string;
  widgetName: string;
  handoffAt: string;
  inboxStatus: string;
  loading: boolean;
  messages: ChatMessage[] | undefined;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  pendingAttachments: ChatAttachment[];
  onRemoveAttachment: (index: number) => void;
  onUploadAttachment: (file: File) => void;
  uploadingAttachment: boolean;
  sendingReply: boolean;
  onSendReply: () => void;
  onDeleteMessage: (messageId: string) => void;
  humanMode?: boolean;
  onReactivateBot?: () => void;
  /** Pausar el bot y tomar el control (humanMode → true) sin tener que responder primero. */
  onSilenceBot?: () => void;
  reactivatingBot?: boolean;
  /** WhatsApp (para mostrar badge identificador). */
  isWhatsApp?: boolean;
  /** Incrementar tras envío exitoso para remontar el composer. */
  composerResetKey?: number;
};

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function cloudinaryDownloadUrl(url: string): string {
  if (/res\.cloudinary\.com/.test(url) && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/fl_attachment/');
  }
  return url;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function contactInitial(name: string) {
  const t = name.trim();
  if (!t) return '?';
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 8 && /^\+?\d[\d\s-]{6,}$/.test(t)) return digits.slice(-2);
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return t.charAt(0).toUpperCase();
}

function sameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtDateDivider(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameCalendarDay(d, now)) return 'Hoy';
  if (sameCalendarDay(d, yesterday)) return 'Ayer';
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });
}

function messageText(m: ChatMessage): string {
  return typeof m.content === 'string' ? m.content : String(m.content ?? '');
}

export function messageHasBody(m: ChatMessage) {
  return Boolean(messageText(m).trim()) || Boolean(m.attachments?.some((a) => a?.url));
}

export function sortMessages(messages: ChatMessage[]) {
  return [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function countVisibleMessages(messages: ChatMessage[]) {
  return sortMessages(messages).filter(messageHasBody).length;
}

function senderKey(m: ChatMessage) {
  if (m.role === 'user') return 'user';
  return m.sentBy === 'human' ? 'human' : 'bot';
}

type ThreadRow =
  | { kind: 'date'; key: string; label: string }
  | { kind: 'msg'; key: string; message: ChatMessage; showMeta: boolean; grouped: boolean; isLastInGroup: boolean };

function buildThreadRows(messages: ChatMessage[]): ThreadRow[] {
  const sorted = sortMessages(messages).filter(messageHasBody);
  const rows: ThreadRow[] = [];
  let prevDay = '';
  let prevSender = '';

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const dayKey = new Date(m.createdAt).toDateString();
    if (dayKey !== prevDay) {
      rows.push({ kind: 'date', key: `d-${dayKey}`, label: fmtDateDivider(m.createdAt) });
      prevDay = dayKey;
      prevSender = '';
    }
    const sk = senderKey(m);
    const next = sorted[i + 1];
    const nextSameGroup =
      next &&
      senderKey(next) === sk &&
      new Date(next.createdAt).toDateString() === dayKey;
    const grouped = sk === prevSender && Boolean(nextSameGroup);
    const isLastInGroup = !nextSameGroup;
    rows.push({
      kind: 'msg',
      key: m.id || `m-${i}`,
      message: m,
      showMeta: sk !== prevSender,
      grouped,
      isLastInGroup,
    });
    prevSender = sk;
  }
  return rows;
}

function MessageContent({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function ConversationThread({
  messages,
  canDelete,
  onDelete,
}: {
  messages: ChatMessage[];
  canDelete?: boolean;
  onDelete?: (messageId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const rows = useMemo(() => buildThreadRows(messages), [messages]);
  const prevCountRef = useRef(0);
  /** true mientras el usuario está cerca del final — evita robar el scroll al subir. */
  const pinnedToBottomRef = useRef(true);
  const threadAnchor = messages[0]?.id || (messages.length === 0 ? '' : `len-${messages.length}-${messages[0]?.createdAt}`);

  useEffect(() => {
    prevCountRef.current = 0;
    pinnedToBottomRef.current = true;
    setShowScrollDown(false);
  }, [threadAnchor]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    pinnedToBottomRef.current = true;
    setShowScrollDown(false);
  }, []);

  useEffect(() => {
    const grew = rows.length > prevCountRef.current;
    const isFirstLoad = prevCountRef.current === 0 && rows.length > 0;
    prevCountRef.current = rows.length;
    // Solo bajar automáticamente al abrir el hilo o si llegaron mensajes y ya estabas abajo.
    if (isFirstLoad || (grew && pinnedToBottomRef.current)) {
      scrollToBottom();
    }
  }, [rows, scrollToBottom]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = dist <= 100;
    pinnedToBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom);
  };

  return (
    <div className="conversation-thread relative flex flex-col flex-1 min-h-0 w-full h-full">
      <div
        ref={ref}
        onScroll={onScroll}
        className="inbox-thread flex flex-col gap-1 flex-1 min-h-0 w-full overflow-y-auto px-2 py-2"
      >
        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-4 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Sin mensajes para mostrar en este hilo.
          </div>
        ) : null}
        {rows.map((row) => {
          if (row.kind === 'date') {
            return (
              <div key={row.key} className="inbox-thread__date">
                <span>{row.label}</span>
              </div>
            );
          }

          const m = row.message;
          const isUser = m.role === 'user';
          const isHuman = m.sentBy === 'human';
          const right = !isUser;
          const label = isUser ? 'Visitante' : isHuman ? 'Tú · Agente' : 'Bot';
          const onDark = isHuman;
          const bubble: React.CSSProperties = isUser
            ? { background: '#fff', color: 'var(--foreground)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }
            : isHuman
              ? { background: 'var(--brand-primary)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.92)', color: 'var(--foreground)', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' };
          const showDelete = canDelete && isHuman && m.id && onDelete;

          return (
            <div
              key={row.key}
              className={`flex flex-col ${right ? 'items-end' : 'items-start'} ${row.grouped ? 'inbox-thread__msg--grouped' : 'inbox-thread__msg'}`}
            >
              {row.showMeta && (
                <div className="flex gap-1.5 items-center mb-1 px-1">
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: isHuman ? 'var(--brand-primary)' : 'var(--muted-foreground)' }}
                  >
                    {label}
                  </span>
                  <span className="text-[10px] font-medium opacity-75" style={{ color: 'var(--muted-foreground)' }}>
                    {fmtTime(m.createdAt)}
                  </span>
                  {showDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete!(m.id!)}
                      title="Retirar mensaje"
                      className="border-0 bg-transparent p-0 inline-flex items-center opacity-60 hover:opacity-100 cursor-pointer"
                      style={{ color: 'var(--muted-foreground)' }}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              )}
              <div
                className="max-w-[88%] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words"
                style={{
                  borderRadius: row.grouped ? (right ? '12px 12px 5px 12px' : '12px 12px 12px 5px') : 16,
                  borderBottomRightRadius: right ? 5 : row.grouped ? 12 : 16,
                  borderBottomLeftRadius: right ? (row.grouped ? 12 : 16) : 5,
                  ...bubble,
                }}
              >
                {messageText(m).trim() ? <MessageContent text={messageText(m)} /> : null}
                {m.attachments?.map((att, ai) =>
                  att.url ? <AttachmentView key={ai} att={att} onDark={onDark} /> : null,
                )}
              </div>
              {isHuman && row.isLastInGroup && <ReadReceipt m={m} />}
            </div>
          );
        })}
      </div>

      {showScrollDown && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          title="Ir al final"
          className="inbox-thread__scroll-btn"
          aria-label="Ir al final del chat"
        >
          <ChevronDown size={18} />
        </button>
      )}
    </div>
  );
}

function AttachmentView({ att, onDark }: { att: ChatAttachment; onDark: boolean }) {
  const top = att.url;
  if (att.type === 'image') {
    return (
      <div className="mt-2">
        <a href={top} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={top}
            alt={att.name || 'imagen'}
            className="max-w-full rounded-lg block"
            style={{ border: '1px solid rgba(15,23,42,0.08)' }}
          />
        </a>
        {att.ocrText ? (
          <p className="text-[11px] opacity-80 mt-1.5 mb-0 whitespace-pre-wrap">
            {att.ocrText.slice(0, 500)}{att.ocrText.length > 500 ? '…' : ''}
          </p>
        ) : null}
      </div>
    );
  }
  if (att.type === 'video') {
    return (
      <div className="mt-2">
        <video src={top} controls className="max-w-full rounded-lg block" />
      </div>
    );
  }
  const fg = onDark ? 'rgba(255,255,255,0.95)' : 'var(--foreground)';
  const sub = onDark ? 'rgba(255,255,255,0.7)' : 'var(--muted-foreground)';
  const bg = onDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.05)';
  return (
    <a
      href={cloudinaryDownloadUrl(top)}
      target="_blank"
      rel="noopener noreferrer"
      download={att.name || undefined}
      className="mt-2 flex items-center gap-2 no-underline rounded-xl max-w-[260px]"
      style={{ padding: '8px 10px', background: bg, color: fg }}
    >
      <FileText size={18} className="shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-semibold truncate">{att.name || 'archivo'}</span>
        {att.bytes ? (
          <span className="block text-[10px]" style={{ color: sub }}>{formatBytes(att.bytes)}</span>
        ) : null}
      </span>
      <Download size={14} className="shrink-0 opacity-80" />
    </a>
  );
}

export function InboxChatModal({
  open,
  onClose,
  contactName,
  widgetName,
  handoffAt,
  inboxStatus,
  loading,
  messages,
  replyDraft,
  onReplyDraftChange,
  pendingAttachments,
  onRemoveAttachment,
  onUploadAttachment,
  uploadingAttachment,
  sendingReply,
  onSendReply,
  onDeleteMessage,
  humanMode = false,
  onReactivateBot,
  onSilenceBot,
  reactivatingBot = false,
  isWhatsApp = false,
  composerResetKey = 0,
}: InboxChatModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Ref a onClose para que el handler de Escape use siempre la última versión
  // sin que el effect dependa de su identidad (que cambia en cada render del padre).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isResolved = inboxStatus === 'resolved';
  const displayName = contactName.trim() || 'Visitante sin nombre';
  const draft = replyDraft.trim();
  const canSend = (draft.length > 0 || pendingAttachments.length > 0) && !sendingReply && !uploadingAttachment;
  const visibleMessageCount = useMemo(
    () => (messages ? countVisibleMessages(messages) : 0),
    [messages],
  );

  const resizeComposer = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 128)}px`;
  }, []);

  // Enfocar SOLO al abrir (cuando `open` pasa a true), nunca en cada render.
  // Si dependiera de `onClose`, cada tecla y cada poll robaría el foco hacia la X.
  useEffect(() => {
    if (!open) return;
    (textareaRef.current ?? closeRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (open) resizeComposer();
  }, [open, replyDraft, resizeComposer, composerResetKey]);

  useEffect(() => {
    if (!replyDraft.trim() && textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  }, [replyDraft, composerResetKey]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inbox-chat-title"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(6px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-full sm:max-w-[580px] overflow-hidden"
        style={{
          height: 'min(760px, 100dvh)',
          maxHeight: '100dvh',
          borderRadius: 'clamp(16px, 3vw, 22px)',
          background: 'var(--card)',
          boxShadow: '0 24px 64px rgba(15,23,42,0.18), 0 4px 16px rgba(15,23,42,0.08)',
          border: '1px solid rgba(15,23,42,0.06)',
        }}
      >
        {/* Header corporativo, tono relajado */}
        <div
          className="shrink-0 px-4 py-4 sm:px-6"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--brand-primary-rgb),0.07) 0%, rgba(var(--brand-warm-rgb,234,179,8),0.04) 100%)',
            borderBottom: '1px solid rgba(15,23,42,0.08)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold"
              style={{
                background: 'rgba(var(--brand-primary-rgb),0.12)',
                color: 'var(--brand-primary)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--brand-primary-rgb),0.15)',
              }}
            >
              {contactInitial(displayName)}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="inbox-chat-title" className="m-0 text-[15px] font-bold truncate">
                  {displayName}
                </h2>
                <span
                  className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
                  style={
                    isResolved
                      ? { background: 'rgba(100,116,139,0.12)', color: 'var(--muted-foreground)' }
                      : { background: 'rgba(34,197,94,0.12)', color: '#16a34a' }
                  }
                >
                  {isResolved ? 'Resuelto' : 'En curso'}
                </span>
                {isWhatsApp && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shrink-0 inline-flex items-center gap-1"
                    style={{ background: 'rgba(37,211,102,0.20)', color: '#1da851', border: '1px solid rgba(37,211,102,0.3)' }}
                  >
                    <MessageSquare size={11} />
                    WhatsApp
                  </span>
                )}
              </div>
              <p className="text-xs m-0 mt-0.5 truncate" style={{ color: 'var(--muted-foreground)' }}>
                {widgetName}
                {visibleMessageCount > 0 ? ` · ${visibleMessageCount} mensaje${visibleMessageCount !== 1 ? 's' : ''}` : ''}
                {' · '}
                {fmtDate(handoffAt)}
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Cerrar chat"
              className="shrink-0 w-9 h-9 rounded-xl border-0 cursor-pointer inline-flex items-center justify-center transition-all hover:bg-black/5"
              style={{ background: 'rgba(255,255,255,0.6)', color: 'var(--foreground)' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Área de mensajes */}
        <div className="inbox-chat__body flex flex-col flex-1 min-h-0 px-4 py-4 sm:px-6">
          {!isResolved && (
            humanMode ? (
              <div className="inbox-chat__mode inbox-chat__mode--human shrink-0 flex items-center justify-between gap-2 mb-3 px-3 py-2.5 rounded-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <Headphones size={14} className="shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-[11px] font-bold leading-tight">Atención humana activa</span>
                    <span className="block text-[10px] opacity-80 leading-tight">El bot no responderá hasta que lo reactives</span>
                  </div>
                </div>
                {onReactivateBot && (
                  <button
                    type="button"
                    disabled={reactivatingBot}
                    onClick={onReactivateBot}
                    title="Reactivar el bot para que responda automáticamente"
                    className="inbox-chat__mode-btn text-[11px] font-bold px-2.5 py-1.5 rounded-lg border-0 cursor-pointer transition-all inline-flex items-center gap-1 shrink-0"
                  >
                    <Bot size={12} />
                    {reactivatingBot ? '…' : 'Devolver al bot'}
                  </button>
                )}
              </div>
            ) : (
              <div className="inbox-chat__mode inbox-chat__mode--bot shrink-0 flex items-center justify-between gap-2 mb-3 px-3 py-2.5 rounded-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <Bot size={14} className="shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-[11px] font-bold leading-tight">Bot respondiendo</span>
                    <span className="block text-[10px] opacity-75 leading-tight">Puedes tomar el control en cualquier momento</span>
                  </div>
                </div>
                {onSilenceBot && (
                  <button
                    type="button"
                    disabled={reactivatingBot}
                    onClick={onSilenceBot}
                    title="Pausar el bot y tomar el control de la conversación"
                    className="inbox-chat__mode-btn text-[11px] font-bold px-2.5 py-1.5 rounded-lg border-0 cursor-pointer transition-all inline-flex items-center gap-1 shrink-0"
                  >
                    <Headphones size={12} />
                    {reactivatingBot ? '…' : 'Atiendo yo'}
                  </button>
                )}
              </div>
            )
          )}

          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm" style={{ color: 'var(--brand-primary)' }}>
              <Loader2 size={18} className="animate-spin" />
              Cargando conversación…
            </div>
          ) : visibleMessageCount > 0 && messages ? (
            <ConversationThread
              messages={messages}
              canDelete={!isResolved}
              onDelete={onDeleteMessage}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center px-6">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(var(--brand-primary-rgb),0.08)' }}
              >
                <MessageSquare size={22} style={{ color: 'var(--brand-primary)' }} />
              </div>
              <p className="text-sm font-semibold m-0" style={{ color: 'var(--foreground)' }}>
                Sin mensajes aún
              </p>
              <p className="text-xs m-0" style={{ color: 'var(--muted-foreground)' }}>
                Cuando el visitante escriba, verás el hilo aquí.
              </p>
            </div>
          )}
        </div>

        {/* Composer — solo sesiones abiertas */}
        {!isResolved && (
          <div
            className="shrink-0 px-4 py-4 sm:px-6 sm:py-5"
            style={{
              borderTop: '1px solid rgba(15,23,42,0.08)',
              background: 'var(--card)',
            }}
          >
            {pendingAttachments.length > 0 && (
              <div key={`att-${composerResetKey}`} className="flex flex-wrap gap-2 mb-2.5">
                {pendingAttachments.map((att, ai) => (
                  <div
                    key={ai}
                    className="relative flex items-center gap-1.5 rounded-xl max-w-[220px]"
                    style={{
                      padding: att.type === 'image' ? 0 : '6px 10px 6px 8px',
                      border: '1px solid var(--border)',
                      background: 'var(--muted)',
                    }}
                  >
                    {att.type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={att.url}
                        alt={att.name || 'imagen'}
                        className="w-16 h-16 object-cover rounded-xl"
                      />
                    ) : att.type === 'video' ? (
                      <>
                        <MessageSquare size={15} style={{ color: 'var(--brand-primary)' }} />
                        <span className="text-[11px] truncate">{att.name || 'video'}</span>
                      </>
                    ) : (
                      <>
                        <FileText size={15} style={{ color: 'var(--brand-primary)' }} />
                        <span className="text-[11px] truncate">{att.name || 'archivo'}</span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveAttachment(ai)}
                      title="Quitar"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full border-0 text-white cursor-pointer flex items-center justify-center"
                      style={{ background: '#ef4444', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadAttachment(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={uploadingAttachment || sendingReply}
                onClick={() => fileInputRef.current?.click()}
                title="Adjuntar archivo"
                className="shrink-0 w-12 h-12 rounded-xl border cursor-pointer inline-flex items-center justify-center transition-all hover:brightness-95 disabled:opacity-50"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--muted)',
                  color: 'var(--muted-foreground)',
                }}
              >
                {uploadingAttachment ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
              </button>
              <textarea
                key={`composer-${composerResetKey}`}
                ref={textareaRef}
                rows={1}
                placeholder="Escribe tu respuesta…"
                className="landing-input inbox-chat__composer flex-1 resize-none text-[14px] leading-relaxed rounded-xl"
                style={{ padding: '12px 14px', minHeight: 44, maxHeight: 128 }}
                value={replyDraft}
                onChange={(e) => {
                  onReplyDraftChange(e.target.value);
                  resizeComposer();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) {
                    e.preventDefault();
                    onSendReply();
                  }
                }}
              />
              <button
                type="button"
                disabled={!canSend}
                onClick={onSendReply}
                title="Enviar (Ctrl/⌘ + Enter)"
                className="shrink-0 w-12 h-12 rounded-xl border-0 text-white cursor-pointer inline-flex items-center justify-center transition-all hover:brightness-110 disabled:opacity-45 disabled:cursor-not-allowed font-semibold"
                style={{ background: 'var(--brand-primary)' }}
              >
                {sendingReply ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <p className="text-[10px] m-0 mt-2" style={{ color: 'var(--muted-foreground)' }}>
              <kbd className="font-bold" style={{ fontFamily: 'inherit' }}>Ctrl</kbd>
              {' + '}
              <kbd className="font-bold" style={{ fontFamily: 'inherit' }}>Enter</kbd>
              {' para enviar'}
            </p>
          </div>
        )}

        {isResolved && (
          <div
            className="shrink-0 px-5 py-3 text-center text-xs"
            style={{
              borderTop: '1px solid rgba(15,23,42,0.06)',
              background: 'var(--card)',
              color: 'var(--muted-foreground)',
            }}
          >
            <User size={12} className="inline mr-1 align-text-bottom" />
            Conversación cerrada — solo lectura
          </div>
        )}
      </div>
    </div>
  );
}
