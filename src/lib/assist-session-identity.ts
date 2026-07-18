/**
 * Identidad y contexto del usuario logueado para Math-ais (dashboard assist).
 */
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Widget } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import {
  formatAssistSessionContextBlock,
  loadAssistSessionContext,
} from '@/lib/assist-session-context';
import { isTrivialMessage } from '@/lib/trivial-message';
import { assistAgentNavigationPromptSection } from '@/lib/assist-agent-navigation';

export type AssistVisitorIdentity = {
  userId: string;
  email: string;
  name: string;
  plan: string;
};

export async function loadAssistVisitorIdentity(userId: string): Promise<AssistVisitorIdentity | null> {
  const ctx = await loadAssistSessionContext(userId);
  if (!ctx) return null;
  return {
    userId: ctx.userId,
    email: ctx.email,
    name: ctx.name,
    plan: ctx.plan,
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
      $or: agentOr,
    })
      .select({ agentHubId: 1 })
      .lean();
    if (ca && String((ca as { agentHubId?: string }).agentHubId || '') === hubId) return true;
  }
  if (params.widgetId && /^[a-f0-9]{24}$/i.test(params.widgetId)) {
    const w = await Widget.findById(params.widgetId).select({ agentId: 1 }).lean();
    const agentId = w ? String((w as { agentId?: string }).agentId || '') : '';
    if (!agentId) return false;
    const ca = await ClientAgent.findById(agentId).select({ agentHubId: 1 }).lean();
    return Boolean(
      ca && String((ca as { agentHubId?: string }).agentHubId || '') === hubId,
    );
  }
  return false;
}

/**
 * Inyecta contexto del cliente logueado (nombre, plan, pantalla, scope Mongo).
 * Idempotente: no duplica bloque si el email ya está en sessionContextBlock.
 */
export async function injectAssistContextIntoChatBody(
  body: Record<string, unknown>,
  identity: AssistVisitorIdentity,
  pagePath?: string,
): Promise<Record<string, unknown>> {
  const prevCtx = typeof body.sessionContextBlock === 'string' ? body.sessionContextBlock.trim() : '';
  if (prevCtx.includes(identity.email) && prevCtx.includes('CONTEXTO DEL CLIENTE LOGUEADO')) {
    return {
      ...body,
      visitorEmail: identity.email,
      visitorName: identity.name,
      visitorUserId: identity.userId,
      visitorPlan: identity.plan,
    };
  }

  const path =
    (typeof body.pagePath === 'string' && body.pagePath.trim()) ||
    (typeof pagePath === 'string' && pagePath.trim()) ||
    '/dashboard';

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const history = Array.isArray(body.history)
    ? (body.history as Array<{ role: string; content: string }>)
    : undefined;
  const contextMode =
    message && isTrivialMessage(message, history) ? 'light' : 'full';

  const sessionCtx = await loadAssistSessionContext(identity.userId, path);
  const block = sessionCtx
    ? `${formatAssistSessionContextBlock(sessionCtx, contextMode)}\n\n${assistAgentNavigationPromptSection()}`
    : `Cliente: ${identity.name} <${identity.email}> · plan ${identity.plan}`;

  return {
    ...body,
    visitorEmail: identity.email,
    visitorName: identity.name,
    visitorUserId: identity.userId,
    visitorPlan: identity.plan,
    sessionContextBlock: prevCtx ? `${block}\n\n${prevCtx}` : block,
  };
}

/** @deprecated Usa injectAssistContextIntoChatBody */
export function injectVisitorIdentityIntoChatBody(
  body: Record<string, unknown>,
  identity: AssistVisitorIdentity,
): Record<string, unknown> {
  const prevCtx = typeof body.sessionContextBlock === 'string' ? body.sessionContextBlock.trim() : '';
  const short = `Cliente logueado: ${identity.name} <${identity.email}> · plan ${identity.plan}`;
  return {
    ...body,
    visitorEmail: identity.email,
    visitorName: identity.name,
    visitorUserId: identity.userId,
    visitorPlan: identity.plan,
    sessionContextBlock: prevCtx ? `${prevCtx}\n\n${short}` : short,
  };
}
