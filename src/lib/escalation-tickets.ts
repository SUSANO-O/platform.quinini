/**
 * Creación de tickets en Zendesk / Freshdesk al escalar una conversación.
 * Requiere plan Growth+ (ESCALATION_TICKET_MIN_PLAN) y configuración en el usuario.
 */

import { Subscription, User, WidgetMessage } from '@/lib/db/models';
import { planHasEscalationTicketFeature, type PlanId } from '@/lib/plan-catalog';

export type EscalationTicketIntegration = {
  provider: 'zendesk' | 'freshdesk';
  subdomain: string;
  apiToken: string;
  /** Zendesk: email del agente API */
  email?: string;
};

export type EscalationTicketContext = {
  userId: string;
  widgetId: string;
  widgetName: string;
  sessionId: string;
  agentId?: string;
  userMessage?: string;
  contactInfo?: { name?: string; email?: string; phone?: string };
  humanSupportPhone?: string;
};

export type EscalationTicketResult = {
  attempted: boolean;
  provider?: 'zendesk' | 'freshdesk';
  ticketId?: string | number;
  ticketUrl?: string;
  error?: string;
  skippedReason?: string;
};

async function resolveUserPlan(userId: string): Promise<PlanId> {
  const sub = await Subscription.findOne({ userId }).select({ plan: 1, status: 1 }).lean() as
    | { plan?: string; status?: string }
    | null;
  const active = sub?.status === 'active' || sub?.status === 'trialing';
  return (active ? (sub?.plan ?? 'free') : 'free') as PlanId;
}

function parseIntegration(raw: unknown): EscalationTicketIntegration | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const provider = o.provider;
  const subdomain = typeof o.subdomain === 'string' ? o.subdomain.trim() : '';
  const apiToken = typeof o.apiToken === 'string' ? o.apiToken.trim() : '';
  if (provider !== 'zendesk' && provider !== 'freshdesk') return null;
  if (!subdomain || !apiToken) return null;
  const email = typeof o.email === 'string' ? o.email.trim() : undefined;
  return { provider, subdomain, apiToken, email };
}

async function loadIntegration(userId: string): Promise<EscalationTicketIntegration | null> {
  const u = await User.findById(userId).select({ escalationTicketIntegration: 1 }).lean() as
    | { escalationTicketIntegration?: unknown }
    | null;
  return parseIntegration(u?.escalationTicketIntegration);
}

export async function buildEscalationTranscript(ctx: EscalationTicketContext): Promise<string> {
  if (!ctx.sessionId) return '';
  const rows = await WidgetMessage.find({ sessionId: ctx.sessionId, userId: ctx.userId })
    .sort({ createdAt: 1 })
    .select({ role: 1, content: 1 })
    .limit(80)
    .lean() as Array<{ role?: string; content?: string }>;

  if (!rows.length) return ctx.userMessage?.trim() ?? '';
  return rows
    .map((m) => {
      const role = m.role === 'user' ? 'Usuario' : 'Asistente';
      const text = (m.content ?? '').trim().slice(0, 2000);
      return `${role}: ${text}`;
    })
    .join('\n\n');
}

function buildSubject(ctx: EscalationTicketContext): string {
  const name = ctx.contactInfo?.name?.trim();
  const base = ctx.widgetName || ctx.widgetId;
  return name ? `[BotIvA] Escalación — ${base} — ${name}` : `[BotIvA] Escalación — ${base}`;
}

function buildDescription(ctx: EscalationTicketContext, transcript: string): string {
  const lines = [
    'Solicitud de atención humana desde el widget BotIvA.',
    '',
    `Widget: ${ctx.widgetName || ctx.widgetId}`,
    `Sesión: ${ctx.sessionId || '—'}`,
    ctx.agentId ? `Agente: ${ctx.agentId}` : '',
    '',
    '--- Contacto ---',
    ctx.contactInfo?.name ? `Nombre: ${ctx.contactInfo.name}` : '',
    ctx.contactInfo?.email ? `Email: ${ctx.contactInfo.email}` : '',
    ctx.contactInfo?.phone ? `Teléfono: ${ctx.contactInfo.phone}` : '',
    ctx.humanSupportPhone ? `WhatsApp widget: ${ctx.humanSupportPhone}` : '',
    '',
    ctx.userMessage?.trim() ? `Mensaje del visitante:\n${ctx.userMessage.trim()}` : '',
    '',
    transcript ? `--- Transcript ---\n${transcript}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

async function createZendeskTicket(
  cfg: EscalationTicketIntegration,
  subject: string,
  description: string,
  requesterEmail?: string,
  requesterName?: string,
): Promise<EscalationTicketResult> {
  const email = cfg.email?.trim();
  if (!email) {
    return { attempted: true, provider: 'zendesk', error: 'Falta email API en integración Zendesk.' };
  }
  const url = `https://${cfg.subdomain}.zendesk.com/api/v2/tickets.json`;
  const auth = Buffer.from(`${email}/token:${cfg.apiToken}`).toString('base64');
  const body = {
    ticket: {
      subject: subject.slice(0, 255),
      comment: { body: description.slice(0, 65000) },
      priority: 'normal',
      tags: ['botiva', 'escalation'],
      ...(requesterEmail
        ? { requester: { email: requesterEmail, name: requesterName || requesterEmail } }
        : {}),
    },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({})) as { ticket?: { id?: number; url?: string } };
    if (!res.ok) {
      return {
        attempted: true,
        provider: 'zendesk',
        error: `Zendesk HTTP ${res.status}`,
      };
    }
    const ticketId = data.ticket?.id;
    return {
      attempted: true,
      provider: 'zendesk',
      ticketId,
      ticketUrl: ticketId
        ? `https://${cfg.subdomain}.zendesk.com/agent/tickets/${ticketId}`
        : data.ticket?.url,
    };
  } catch (err) {
    return {
      attempted: true,
      provider: 'zendesk',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function createFreshdeskTicket(
  cfg: EscalationTicketIntegration,
  subject: string,
  description: string,
  requesterEmail?: string,
  requesterName?: string,
): Promise<EscalationTicketResult> {
  const url = `https://${cfg.subdomain}.freshdesk.com/api/v2/tickets`;
  const body = {
    subject: subject.slice(0, 255),
    description: description.slice(0, 65000),
    email: requesterEmail || undefined,
    name: requesterName || undefined,
    priority: 2,
    status: 2,
    tags: ['botiva', 'escalation'],
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.apiToken}:X`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({})) as { id?: number };
    if (!res.ok) {
      return {
        attempted: true,
        provider: 'freshdesk',
        error: `Freshdesk HTTP ${res.status}`,
      };
    }
    return {
      attempted: true,
      provider: 'freshdesk',
      ticketId: data.id,
      ticketUrl: data.id
        ? `https://${cfg.subdomain}.freshdesk.com/a/tickets/${data.id}`
        : undefined,
    };
  } catch (err) {
    return {
      attempted: true,
      provider: 'freshdesk',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Best-effort: no lanza excepciones. */
export async function createEscalationTicket(
  ctx: EscalationTicketContext,
): Promise<EscalationTicketResult> {
  const plan = await resolveUserPlan(ctx.userId);
  if (!planHasEscalationTicketFeature(plan)) {
    return { attempted: false, skippedReason: 'plan_insufficient' };
  }

  const integration = await loadIntegration(ctx.userId);
  if (!integration) {
    return { attempted: false, skippedReason: 'no_integration' };
  }

  const transcript = await buildEscalationTranscript(ctx);
  const subject = buildSubject(ctx);
  const description = buildDescription(ctx, transcript);
  const email = ctx.contactInfo?.email?.trim();
  const name = ctx.contactInfo?.name?.trim();

  if (integration.provider === 'zendesk') {
    return createZendeskTicket(integration, subject, description, email, name);
  }
  return createFreshdeskTicket(integration, subject, description, email, name);
}
