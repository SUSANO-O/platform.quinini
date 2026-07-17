/**
 * Asegura los 2 asistentes internos de la landing bajo el perfil admin:
 * - marketing / aterrizaje → Math (hub: math)
 * - app / usuario (dashboard) → Math-ais (hub: math-ais)
 *
 * Ambos son isPlatform + widgets wt_* del admin (no consumen cupo de clientes).
 */

import { randomBytes } from 'crypto';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, User, Widget } from '@/lib/db/models';
import type { InternalAssistContext } from '@/lib/internal-assist-config';
import { canAttemptHubSync, ensureClientAgentHubSynced, syncHubCatalogFromLandingAgentDoc } from '@/lib/aibackhub-sync';

export type LandingAssistSlot = {
  context: InternalAssistContext;
  hubId: string;
  name: string;
  description: string;
  widgetName: string;
  color: string;
  title: string;
  subtitle: string;
  welcome: string;
  fabHint: string;
  avatar: string;
  systemPrompt: string;
};

export function landingAssistSlots(): LandingAssistSlot[] {
  return [
    {
      context: 'marketing',
      hubId: (process.env.INTERNAL_MARKETING_ASSIST_AGENT_ID || 'math').trim() || 'math',
      name: 'Math',
      description: 'Asistente de aterrizaje (landing / marketing BotIvA).',
      widgetName: 'Assist — Aterrizaje (Math)',
      color: (process.env.INTERNAL_MARKETING_ASSIST_COLOR || '#006B7D').trim(),
      title: (process.env.INTERNAL_MARKETING_ASSIST_TITLE || 'Math').trim(),
      subtitle: (process.env.INTERNAL_MARKETING_ASSIST_SUBTITLE || 'En linea').trim(),
      welcome: (process.env.INTERNAL_MARKETING_ASSIST_WELCOME || 'Hola! Como puedo ayudarte hoy?').trim(),
      fabHint: (process.env.INTERNAL_MARKETING_ASSIST_FAB_HINT || 'Hola! Como puedo ayudarte hoy?').trim(),
      avatar: (
        process.env.INTERNAL_MARKETING_ASSIST_AVATAR ||
        '/assets/marketing/math-avatar-cutout.webp'
      ).trim(),
      systemPrompt:
        'Eres Math, el asistente de la landing de BotIvA. Ayudas a visitantes con dudas sobre el producto, planes y cómo empezar. Sé claro, cercano y breve. Si piden atención humana, sugiere WhatsApp cuando esté disponible.',
    },
    {
      context: 'app',
      hubId: (process.env.INTERNAL_APP_ASSIST_AGENT_ID || 'math-ais').trim() || 'math-ais',
      name: 'Math-ais',
      description: 'Asistente del panel de usuario (dashboard).',
      widgetName: 'Assist — Usuario (Math-ais)',
      color: (process.env.INTERNAL_APP_ASSIST_COLOR || '#006B7D').trim(),
      title: (process.env.INTERNAL_APP_ASSIST_TITLE || 'Math-ais').trim(),
      subtitle: (process.env.INTERNAL_APP_ASSIST_SUBTITLE || 'En linea').trim(),
      welcome: (process.env.INTERNAL_APP_ASSIST_WELCOME || 'Hola! Como puedo ayudarte hoy?').trim(),
      fabHint: (process.env.INTERNAL_APP_ASSIST_FAB_HINT || '¿Tienes dudas plataforma?').trim(),
      avatar: (process.env.INTERNAL_APP_ASSIST_AVATAR || '/assets/assist/botivaorbe.webp').trim(),
      systemPrompt:
        'Eres Math-ais, el asistente de la plataforma BotIvA dentro del dashboard. Ayudas a usuarios autenticados con agentes, widgets, flujos, planes y configuración. Sé práctico y orientado a pasos concretos.',
    },
  ];
}

export type LandingAssistStatusItem = {
  context: InternalAssistContext;
  hubId: string;
  name: string;
  description: string;
  agent: {
    id: string;
    name: string;
    agentHubId: string | null;
    isPlatform: boolean;
    userId: string;
    status: string;
    syncStatus?: string;
  } | null;
  widget: {
    id: string;
    name: string;
    hasToken: boolean;
    active: boolean;
    userId: string;
  } | null;
  ready: boolean;
};

async function resolveAdminOwnerId(preferredAdminId?: string): Promise<string | null> {
  if (preferredAdminId && /^[a-f0-9]{24}$/i.test(preferredAdminId)) {
    const me = (await User.findById(preferredAdminId).select({ role: 1 }).lean()) as {
      role?: string;
    } | null;
    if (me?.role === 'admin') return preferredAdminId;
  }
  const admin = (await User.findOne({ role: 'admin' }).sort({ createdAt: 1 }).select({ _id: 1 }).lean()) as {
    _id?: { toString(): string };
  } | null;
  return admin?._id?.toString() || null;
}

export async function getLandingAssistStatus(adminUserId?: string): Promise<{
  adminUserId: string | null;
  items: LandingAssistStatusItem[];
}> {
  await connectDB();
  const ownerId = await resolveAdminOwnerId(adminUserId);
  const slots = landingAssistSlots();
  const items: LandingAssistStatusItem[] = [];

  for (const slot of slots) {
    const agent = (await ClientAgent.findOne({
      $or: [{ agentHubId: slot.hubId }, { name: slot.name, isPlatform: true }],
    })
      .select({ _id: 1, name: 1, agentHubId: 1, isPlatform: 1, userId: 1, status: 1, syncStatus: 1 })
      .lean()) as {
      _id: unknown;
      name?: string;
      agentHubId?: string | null;
      isPlatform?: boolean;
      userId?: string;
      status?: string;
      syncStatus?: string;
    } | null;

    let widget: LandingAssistStatusItem['widget'] = null;
    if (agent) {
      const w = (await Widget.findOne({
        agentId: String(agent._id),
        ...(ownerId ? { userId: ownerId } : {}),
      })
        .sort({ createdAt: 1 })
        .select({ _id: 1, name: 1, afhubToken: 1, active: 1, userId: 1 })
        .lean()) as {
        _id: unknown;
        name?: string;
        afhubToken?: string | null;
        active?: boolean;
        userId?: string;
      } | null;

      // Fallback: cualquier widget ligado al agente plataforma
      const w2 =
        w ||
        ((await Widget.findOne({ agentId: String(agent._id) })
          .sort({ createdAt: 1 })
          .select({ _id: 1, name: 1, afhubToken: 1, active: 1, userId: 1 })
          .lean()) as typeof w);

      if (w2) {
        widget = {
          id: String(w2._id),
          name: String(w2.name || ''),
          hasToken: Boolean(w2.afhubToken && String(w2.afhubToken).startsWith('wt_')),
          active: w2.active !== false,
          userId: String(w2.userId || ''),
        };
      }
    }

    items.push({
      context: slot.context,
      hubId: slot.hubId,
      name: slot.name,
      description: slot.description,
      agent: agent
        ? {
            id: String(agent._id),
            name: String(agent.name || slot.name),
            agentHubId: agent.agentHubId ? String(agent.agentHubId) : null,
            isPlatform: agent.isPlatform === true,
            userId: String(agent.userId || ''),
            status: String(agent.status || 'active'),
            syncStatus: agent.syncStatus ? String(agent.syncStatus) : undefined,
          }
        : null,
      widget,
      ready: Boolean(agent && widget?.hasToken && widget.active),
    });
  }

  return { adminUserId: ownerId, items };
}

export async function ensureLandingAssistAgents(options?: {
  adminUserId?: string;
  syncHub?: boolean;
}): Promise<{
  adminUserId: string;
  created: { agents: string[]; widgets: string[] };
  updated: { agents: string[]; widgets: string[] };
  items: LandingAssistStatusItem[];
}> {
  await connectDB();
  const ownerId = await resolveAdminOwnerId(options?.adminUserId);
  if (!ownerId) {
    throw new Error('No hay usuario admin en la base de datos.');
  }

  const created = { agents: [] as string[], widgets: [] as string[] };
  const updated = { agents: [] as string[], widgets: [] as string[] };
  const syncHub = options?.syncHub !== false && canAttemptHubSync();

  for (const slot of landingAssistSlots()) {
    let agent = await ClientAgent.findOne({ agentHubId: slot.hubId });
    if (!agent) {
      agent = await ClientAgent.findOne({ name: slot.name, isPlatform: true, type: 'agent' });
    }

    if (!agent) {
      agent = await ClientAgent.create({
        userId: ownerId,
        name: slot.name,
        description: slot.description,
        systemPrompt: slot.systemPrompt,
        model: 'gemini-2.5-flash',
        type: 'agent',
        status: 'active',
        tools: [],
        agentHubId: slot.hubId,
        isPlatform: true,
        syncStatus: 'pending',
        ragEnabled: false,
        strictPurposeOnly: true,
      });
      created.agents.push(String(agent._id));
    } else {
      const $set: Record<string, unknown> = {
        isPlatform: true,
        status: 'active',
        userId: ownerId,
        description: slot.description,
      };
      if (!agent.agentHubId) $set.agentHubId = slot.hubId;
      await ClientAgent.updateOne({ _id: agent._id }, { $set });
      updated.agents.push(String(agent._id));
      agent = await ClientAgent.findById(agent._id);
    }

    if (syncHub && agent) {
      try {
        const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
        if (hubId) {
          await syncHubCatalogFromLandingAgentDoc(agent);
        } else {
          await ensureClientAgentHubSynced(String(agent._id), ownerId);
        }
      } catch (err) {
        console.warn(
          `[landing-assist] sync hub falló para ${slot.hubId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    const agentId = String(agent!._id);
    let widget = await Widget.findOne({ userId: ownerId, agentId }).sort({ createdAt: 1 });
    if (!widget) {
      widget = await Widget.findOne({ agentId }).sort({ createdAt: 1 });
    }

    if (!widget) {
      const afhubToken = `wt_${randomBytes(24).toString('hex')}`;
      widget = await Widget.create({
        userId: ownerId,
        name: slot.widgetName,
        agentId,
        afhubToken,
        color: slot.color,
        title: slot.title,
        subtitle: slot.subtitle,
        welcome: slot.welcome,
        fabHint: slot.fabHint,
        avatar: slot.avatar,
        position: 'bottom-right',
        theme: 'light',
        borderRadius: 16,
        autoOpen: false,
        voiceEnabled: true,
        humanSupportEnabled: true,
        handoffEnabled: false,
        humanSupportPhone: (process.env.INTERNAL_ASSIST_HUMAN_PHONE || '+57 313 3174629').trim(),
        active: true,
        allowedOrigins: [],
      });
      created.widgets.push(String(widget._id));
    } else {
      const token =
        typeof widget.afhubToken === 'string' && widget.afhubToken.startsWith('wt_')
          ? widget.afhubToken
          : `wt_${randomBytes(24).toString('hex')}`;
      await Widget.updateOne(
        { _id: widget._id },
        {
          $set: {
            userId: ownerId,
            name: slot.widgetName,
            agentId,
            afhubToken: token,
            color: slot.color,
            title: slot.title,
            subtitle: slot.subtitle,
            welcome: slot.welcome,
            fabHint: slot.fabHint,
            avatar: slot.avatar,
            active: true,
            humanSupportEnabled: true,
            handoffEnabled: false,
          },
        },
      );
      updated.widgets.push(String(widget._id));
    }
  }

  const status = await getLandingAssistStatus(ownerId);
  return {
    adminUserId: ownerId,
    created,
    updated,
    items: status.items,
  };
}

/** Resuelve widget Mongo del assist interno (env o auto por agente plataforma del admin). */
export async function resolveInternalAssistWidgetId(
  context: InternalAssistContext,
): Promise<string | null> {
  const envKey =
    context === 'marketing'
      ? 'INTERNAL_MARKETING_ASSIST_WIDGET_ID'
      : 'INTERNAL_APP_ASSIST_WIDGET_ID';
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv && /^[a-f0-9]{24}$/i.test(fromEnv)) return fromEnv;

  const status = await getLandingAssistStatus();
  const item = status.items.find((i) => i.context === context);
  return item?.widget?.id || null;
}
