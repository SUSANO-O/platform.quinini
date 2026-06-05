export type InboxVisitorContact = { name?: string; email?: string; phone?: string };

export function formatPhoneDisplay(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return s.startsWith('+') ? s : `+${digits}`;
}

export function phoneFromWhatsAppSessionId(sessionId: string): string | null {
  if (!sessionId.startsWith('wa:')) return null;
  const colon = sessionId.indexOf(':', 3);
  if (colon === -1) return null;
  return formatPhoneDisplay(sessionId.slice(colon + 1));
}

export function phoneFromVisitorId(visitorId: string): string | null {
  const vid = visitorId.trim();
  if (!vid) return null;
  if (vid.startsWith('wa_')) return formatPhoneDisplay(vid.slice(3));
  if (/^\d{8,15}$/.test(vid)) return formatPhoneDisplay(vid);
  return null;
}

export function resolveInboxVisitorDisplay(input: {
  contact?: InboxVisitorContact | null;
  visitorId?: string;
  sessionId?: string;
  chatSessionId?: string;
}): string {
  const contact = input.contact || {};
  const name = typeof contact.name === 'string' ? contact.name.trim() : '';
  if (name) return name;

  const phone =
    formatPhoneDisplay(contact.phone) ||
    phoneFromVisitorId(input.visitorId || '') ||
    phoneFromWhatsAppSessionId(input.sessionId || '') ||
    phoneFromWhatsAppSessionId(input.chatSessionId || '');
  if (phone) return phone;

  const vid = (input.visitorId || '').trim();
  if (vid) return `Visitante · ${vid.slice(0, 8)}`;
  return 'Visitante sin nombre';
}

export function enrichInboxContact(
  contact: InboxVisitorContact | null | undefined,
  session: { sessionId: string; chatSessionId?: string | null; visitorId?: string | null },
): InboxVisitorContact {
  const base =
    contact && typeof contact === 'object'
      ? {
          ...(typeof contact.name === 'string' ? { name: contact.name } : {}),
          ...(typeof contact.email === 'string' ? { email: contact.email } : {}),
          ...(contact.phone != null ? { phone: String(contact.phone) } : {}),
        }
      : {};

  if (formatPhoneDisplay(base.phone)) return base;

  const derived =
    phoneFromVisitorId(String(session.visitorId || '')) ||
    phoneFromWhatsAppSessionId(String(session.sessionId || '')) ||
    phoneFromWhatsAppSessionId(String(session.chatSessionId || '').trim());
  if (!derived) return base;

  return { ...base, phone: derived.replace(/^\+/, '') };
}
