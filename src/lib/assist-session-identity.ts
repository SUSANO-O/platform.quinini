/**
 * Identidad del usuario logueado para el asistente interno (Math-ais) + HubSpot.
 * Se inyecta en el transcript del widget para auto-capture y contexto del agente.
 */
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription, User, Widget } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

export type AssistVisitorIdentity = {
  userId: string;
  email: string;
  name: string;
  plan: string;
  /** Texto parseable por HubSpot auto-capture (nombre + email). */
  hubspotSeedMessage: string;
};

export function buildHubspotSeedMessage(name: string, email: string, plan?: string): string {
  const n = name.trim() || 'Cliente BotIvA';
  const e = email.trim().toLowerCase();
  const planBit = plan && plan !== 'free' ? ` Plan: ${plan}.` : '';
  return `Me llamo ${n}. Mi email es ${e}.${planBit}`.trim();
}

export async function loadAssistVisitorIdentity(userId: string): Promise<AssistVisitorIdentity | null> {
  if (!userId) return null;
  await connectDB();
  const user = (await User.findById(userId)
    .select({ email: 1, displayName: 1 })
    .lean()) as { email?: string; displayName?: string | null } | null;
  if (!user?.email) return null;
  const sub = (await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1 })
    .lean()) as { plan?: string; status?: string } | null;
  const plan =
    sub?.status === 'active' || sub?.status === 'trialing' ? String(sub.plan || 'free') : 'free';
  const email = String(user.email).trim().toLowerCase();
  const name = (user.displayName || email.split('@')[0] || 'Cliente').trim();
  return {
    userId,
    email,
    name,
    plan,
    hubspotSeedMessage: buildHubspotSeedMessage(name, email, plan),
  };
}

export async function identityFromSessionCookie(
  cookieValue: string | undefined,
): Promise<AssistVisitorIdentity | null> {
  if (!cookieValue) return null;
  const userId = verifySessionToken(cookieValue);
  if (!userId) return null;
  return loadAssistVisitorIdentity(userId);
}

/** ¿Este widget/agente es el assist interno del dashboard (Math-ais)? */
export async function isInternalAppAssistWidget(params: {
  widgetId?: string;
  agentId?: string;
}): Promise<boolean> {
  const hubId = (process.env.INTERNAL_APP_ASSIST_AGENT_ID || 'math-ais').trim() || 'math-ais';
  const envWidget = process.env.INTERNAL_APP_ASSIST_WIDGET_ID?.trim();
  if (params.widgetId && envWidget && params.widgetId === envWidget) return true;

  await connectDB();
  if (params.agentId) {
    const agentOr = [
      ...(params.agentId.match(/^[a-f0-9]{24}$/i) ? [{ _id: params.agentId }] : []),
      { agentHubId: params.agentId },
      { agentHubId: hubId },
    ];
    const ca = await ClientAgent.findOne({
      $and: [{ $or: agentOr }, { isPlatform: true }],
    })
      .select({ agentHubId: 1 })
      .lean();
    if (ca && String((ca as { agentHubId?: string }).agentHubId || '') === hubId) return true;
  }
  if (params.widgetId && /^[a-f0-9]{24}$/i.test(params.widgetId)) {
    const w = await Widget.findById(params.widgetId).select({ agentId: 1 }).lean();
    const agentId = w ? String((w as { agentId?: string }).agentId || '') : '';
    if (!agentId) return false;
    const ca = await ClientAgent.findById(agentId).select({ agentHubId: 1, isPlatform: 1 }).lean();
    return Boolean(
      ca &&
        (ca as { isPlatform?: boolean }).isPlatform === true &&
        String((ca as { agentHubId?: string }).agentHubId || '') === hubId,
    );
  }
  return false;
}

/**
 * Inyecta identidad en el body del chat (history + visitor*) para HubSpot / prompt.
 * Idempotente si el seed ya está en history.
 */
export function injectVisitorIdentityIntoChatBody(
  body: Record<string, unknown>,
  identity: AssistVisitorIdentity,
): Record<string, unknown> {
  const seed = identity.hubspotSeedMessage;
  const history = Array.isArray(body.history) ? [...(body.history as unknown[])] : [];
  const already = history.some((h) => {
    if (!h || typeof h !== 'object') return false;
    const c = String((h as { content?: unknown }).content || '');
    return c.includes(identity.email) && /me\s+llamo/i.test(c);
  });
  if (!already) {
    history.unshift({ role: 'user', content: seed });
  }
  const ctx = `Cliente logueado en BotIvA: ${identity.name} <${identity.email}> · plan ${identity.plan} · userId ${identity.userId}`;
  const prevCtx = typeof body.sessionContextBlock === 'string' ? body.sessionContextBlock.trim() : '';
  return {
    ...body,
    history,
    visitorEmail: identity.email,
    visitorName: identity.name,
    visitorUserId: identity.userId,
    visitorPlan: identity.plan,
    sessionContextBlock: prevCtx ? `${prevCtx}\n\n${ctx}` : ctx,
  };
}
