/**
 * Contexto específico por pantalla del dashboard (Math-ais).
 */
import mongoose from 'mongoose';
import { ClientAgent, ConversationSession, Widget } from '@/lib/db/models';

export type AssistScreenContext = {
  screenKind: string;
  resourceId?: string;
  resourceName?: string;
  resourceMeta?: Record<string, string | number | boolean>;
};

export type AssistInboxSummary = {
  openCount: number;
  humanModeCount: number;
};

export async function loadAssistInboxSummary(userId: string): Promise<AssistInboxSummary> {
  const [openCount, humanModeCount] = await Promise.all([
    ConversationSession.countDocuments({
      userId,
      $or: [{ inboxStatus: 'open' }, { escalated: true, inboxStatus: { $ne: 'resolved' } }],
    }),
    ConversationSession.countDocuments({ userId, humanMode: true, inboxStatus: { $ne: 'resolved' } }),
  ]);
  return { openCount, humanModeCount };
}

export async function loadAssistScreenContext(
  userId: string,
  pagePath: string,
): Promise<AssistScreenContext | null> {
  const p = pagePath.split('?')[0].replace(/\/$/, '') || '/dashboard';

  const agentDetail = p.match(/^\/dashboard\/agents\/([a-f0-9]{24})$/i);
  if (agentDetail) {
    const id = agentDetail[1];
    const agent = await ClientAgent.findOne({ _id: id, userId })
      .select({ name: 1, agentHubId: 1, status: 1, ragEnabled: 1 })
      .lean() as {
      name?: string;
      agentHubId?: string;
      status?: string;
      ragEnabled?: boolean;
    } | null;
    if (agent) {
      return {
        screenKind: 'agent_detail',
        resourceId: id,
        resourceName: String(agent.name || 'Agente'),
        resourceMeta: {
          agentHubId: String(agent.agentHubId || ''),
          status: String(agent.status || 'active'),
          ragEnabled: agent.ragEnabled === true,
        },
      };
    }
  }

  if (p === '/dashboard/agents/new') {
    return { screenKind: 'agent_create' };
  }
  if (p.startsWith('/dashboard/widgets')) {
    return { screenKind: 'widgets_list' };
  }
  if (p.startsWith('/dashboard/widget-builder')) {
    return { screenKind: 'widget_builder' };
  }
  if (p.startsWith('/dashboard/inbox') || p.startsWith('/dashboard/chats')) {
    return { screenKind: 'inbox' };
  }
  if (p.startsWith('/dashboard/mcp')) {
    return { screenKind: 'mcp_integrations' };
  }
  if (p.startsWith('/dashboard/settings')) {
    return { screenKind: 'settings' };
  }

  const widgetDetail = p.match(/^\/dashboard\/widgets\/([a-f0-9]{24})$/i);
  if (widgetDetail) {
    const id = widgetDetail[1];
    if (mongoose.Types.ObjectId.isValid(id)) {
      const w = await Widget.findOne({ _id: id, userId }).select({ name: 1, active: 1 }).lean() as {
        name?: string;
        active?: boolean;
      } | null;
      if (w) {
        return {
          screenKind: 'widget_detail',
          resourceId: id,
          resourceName: String(w.name || 'Widget'),
          resourceMeta: { active: w.active !== false },
        };
      }
    }
  }

  if (p === '/dashboard' || p === '/dashboard/') {
    return { screenKind: 'dashboard_home' };
  }

  return { screenKind: 'dashboard_other' };
}

export function buildProactiveHints(input: {
  pageLabel: string;
  pagePath: string;
  onboarding: { hasAgent: boolean; hasWidget: boolean; hasPaidPlan: boolean };
  agentsTotal: number;
  widgetsTotal: number;
  inbox: AssistInboxSummary;
  screen: AssistScreenContext | null;
}): string[] {
  const hints: string[] = [];

  if (input.inbox.openCount > 0) {
    hints.push(
      `Tiene ${input.inbox.openCount} conversación(es) abierta(s) en Inbox — puede ofrecer revisarlas.`,
    );
  }
  if (input.inbox.humanModeCount > 0) {
    hints.push('Hay conversaciones en modo humano (equipo atendiendo).');
  }

  if (input.onboarding.hasAgent && !input.onboarding.hasWidget) {
    hints.push(
      'Ya tiene agente(s) pero ningún widget activo — sugerir Widget builder o embed.',
    );
  }
  if (!input.onboarding.hasAgent) {
    hints.push('Aún no tiene agentes — guiar a Dashboard → Agentes → Nuevo agente.');
  }
  if (input.onboarding.hasAgent && input.onboarding.hasWidget && input.screen?.screenKind === 'dashboard_home') {
    hints.push('Onboarding avanzado — puede proponer MCP, RAG o allowed origins según objetivo.');
  }

  if (input.screen?.screenKind === 'agent_detail' && input.screen.resourceName) {
    hints.push(
      `Está en el detalle del agente «${input.screen.resourceName}» — ayuda contextual sobre prompt, skills, RAG o widget.`,
    );
  }
  if (input.screen?.screenKind === 'agent_create') {
    hints.push('Está creando un agente — guiar nombre, prompt, modelo y guardar.');
  }
  if (input.screen?.screenKind === 'widget_builder') {
    hints.push('Está en Widget builder — ayudar con diseño, preview y código embed.');
  }
  if (input.screen?.screenKind === 'inbox') {
    hints.push('Está en Inbox — ayudar a filtrar, responder o escalar conversaciones.');
  }

  if (hints.length === 0) {
    hints.push(`Pantalla: ${input.pageLabel}. Ofrece ayuda concreta según lo que vea ahí.`);
  }

  return hints.slice(0, 4);
}
