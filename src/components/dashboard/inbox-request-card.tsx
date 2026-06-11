'use client';

import {
  Bell,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import { formatPhoneDisplay, phoneFromVisitorId, phoneFromWhatsAppSessionId, resolveInboxVisitorDisplay } from '@/lib/inbox-visitor-display';

export type InboxCardItem = {
  sessionId: string;
  widgetName: string;
  handoffAt: string;
  inboxStatus: string;
  contact: { name?: string; email?: string; phone?: string };
  handoffMessage: string;
  lastMessage: string;
  lastMessageAt: string | null;
  lastHasAttachments: boolean;
  messageCount: number;
  hasUnread: boolean;
  needsReply: boolean;
  humanMode: boolean;
  visitorId: string;
  followUpAt: string | null;
  followUpNote: string;
};

const AVATAR_PALETTE = [
  { bg: '#e6f2f4', fg: '#004A57', border: '#a8cdd4' },
  { bg: '#eef2f6', fg: '#475569', border: '#cbd5e1' },
  { bg: '#e6f2f1', fg: '#0f766e', border: '#a7d4cf' },
  { bg: '#edf2f7', fg: '#334155', border: '#c5d0dc' },
] as const;

export function displayVisitorName(item: InboxCardItem): string {
  return resolveInboxVisitorDisplay({
    contact: item.contact,
    visitorId: item.visitorId,
    sessionId: item.sessionId,
  });
}

export function visitorInitials(item: InboxCardItem): string {
  const name = item.contact.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  const phone =
    formatPhoneDisplay(item.contact.phone)?.replace(/\D/g, '') ||
    phoneFromVisitorId(item.visitorId)?.replace(/\D/g, '') ||
    phoneFromWhatsAppSessionId(item.sessionId)?.replace(/\D/g, '') ||
    '';
  if (phone.length >= 2) return phone.slice(-2);
  return 'V';
}

export function avatarPalette(item: InboxCardItem) {
  const key = item.contact.name || item.contact.phone || item.visitorId || item.sessionId;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[h];
}

export function lastMessagePreview(item: InboxCardItem): string {
  if (item.lastHasAttachments && !item.lastMessage.trim()) return 'Adjunto enviado';
  if (item.lastMessage.trim()) return item.lastMessage.trim();
  if (item.handoffMessage.trim()) return item.handoffMessage.trim();
  return 'Sin mensajes aún';
}

export function relativeTime(iso: string | null): string {
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

export function InboxRequestCard({
  item,
  tab,
  chatOpen,
  showFollowUp,
  followUpDraft,
  deleting,
  fmtDate,
  onOpenChat,
  onResolve,
  onReopen,
  onDelete,
  onToggleFollowUp,
  onFollowUpDraftChange,
  onSaveFollowUp,
}: {
  item: InboxCardItem;
  tab: 'open' | 'resolved';
  chatOpen: boolean;
  showFollowUp: boolean;
  followUpDraft?: { at: string; note: string };
  deleting: boolean;
  fmtDate: (iso: string) => string;
  onOpenChat: () => void;
  onResolve: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onToggleFollowUp: () => void;
  onFollowUpDraftChange: (patch: { at?: string; note?: string }) => void;
  onSaveFollowUp: () => void;
}) {
  const visitorName = displayVisitorName(item);
  const preview = lastMessagePreview(item);
  const activityAt = item.lastMessageAt || item.handoffAt;
  const palette = avatarPalette(item);
  const isWhatsApp = item.sessionId.startsWith('wa:');

  return (
    <article className="inbox-card card-texture">
      <div className="inbox-card__head">
        <div className="inbox-card__identity">
          <div className="inbox-card__avatar-wrap">
            <div
              className="inbox-card__avatar"
              style={{ background: palette.bg, color: palette.fg, borderColor: palette.border }}
              aria-hidden
            >
              {visitorInitials(item)}
            </div>
            {item.hasUnread && item.inboxStatus !== 'resolved' ? (
              <span className="inbox-card__unread" aria-label="Sin leer" />
            ) : null}
          </div>
          <div className="inbox-card__meta min-w-0">
            <div className="inbox-card__name-row">
              <p className="inbox-card__name m-0">{visitorName}</p>
              {isWhatsApp ? (
                <span className="inbox-card__tag inbox-card__tag--whatsapp">
                  <MessageCircle size={11} aria-hidden />
                  WhatsApp
                </span>
              ) : null}
              {item.needsReply && item.inboxStatus !== 'resolved' ? (
                <span className="inbox-card__tag inbox-card__tag--pending">Sin responder</span>
              ) : null}
              {item.humanMode && item.inboxStatus !== 'resolved' ? (
                <span className="inbox-card__tag inbox-card__tag--live">En vivo</span>
              ) : null}
            </div>
            <p className="inbox-card__widget m-0">{item.widgetName}</p>
          </div>
        </div>

        <div className="inbox-card__time-col">
          <span className="inbox-card__time" title={fmtDate(activityAt)}>
            {relativeTime(activityAt)}
          </span>
          {tab === 'open' ? (
            <button type="button" className="inbox-card__reminder" onClick={onToggleFollowUp}>
              <Bell size={12} aria-hidden />
              {item.followUpAt ? fmtDate(item.followUpAt) : 'Agregar recordatorio'}
              {showFollowUp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : null}
        </div>
      </div>

      <div className="inbox-card__quote">
        <p className="m-0">{preview}</p>
      </div>

      {tab === 'open' && showFollowUp ? (
        <div className="inbox-card__followup">
          {item.followUpNote ? (
            <p className="inbox-card__followup-note m-0">{item.followUpNote}</p>
          ) : null}
          <div className="inbox-card__followup-fields">
            <input
              type="datetime-local"
              value={
                followUpDraft?.at ??
                (item.followUpAt ? new Date(item.followUpAt).toISOString().slice(0, 16) : '')
              }
              onChange={(e) => onFollowUpDraftChange({ at: e.target.value })}
            />
            <input
              type="text"
              placeholder="Nota breve"
              value={followUpDraft?.note ?? item.followUpNote ?? ''}
              onChange={(e) => onFollowUpDraftChange({ note: e.target.value })}
            />
            <button type="button" className="inbox-card__followup-save" onClick={onSaveFollowUp}>
              Guardar
            </button>
          </div>
        </div>
      ) : null}

      <div className="inbox-card__actions">
        <div className="inbox-card__actions-left">
          <button
            type="button"
            className={`inbox-card__btn inbox-card__btn--chat${chatOpen ? ' is-active' : ''}`}
            onClick={onOpenChat}
          >
            <Send size={14} aria-hidden />
            {item.hasUnread ? 'Ver y responder' : 'Abrir chat'}
            {!item.needsReply && item.messageCount > 0 ? (
              <span className="inbox-card__count">{item.messageCount}</span>
            ) : null}
          </button>
          {item.inboxStatus !== 'resolved' ? (
            <button type="button" className="inbox-card__btn inbox-card__btn--resolve" onClick={onResolve}>
              Resolver
            </button>
          ) : (
            <button type="button" className="inbox-card__btn inbox-card__btn--resolve" onClick={onReopen}>
              <RotateCcw size={13} aria-hidden />
              Reabrir
            </button>
          )}
        </div>
        <button
          type="button"
          className="inbox-card__btn inbox-card__btn--delete"
          disabled={deleting}
          onClick={onDelete}
        >
          {deleting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Trash2 size={14} aria-hidden />}
          Eliminar
        </button>
      </div>
    </article>
  );
}
