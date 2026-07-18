/**
 * Contexto de producto para Math-ais: solo datos del usuario logueado (sin infra interna).
 */
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription, User, Widget } from '@/lib/db/models';
import { hasFeatureOverride, VALID_FEATURE_OVERRIDES } from '@/lib/plan-catalog';
import {
  buildProactiveHints,
  loadAssistInboxSummary,
  loadAssistScreenContext,
  type AssistInboxSummary,
  type AssistScreenContext,
} from '@/lib/assist-session-screen';
import {
  formatAssistAgentDetailSnapshotBlock,
  loadAssistAgentDetailSnapshot,
  type AssistAgentDetailSnapshot,
} from '@/lib/assist-agent-detail-snapshot';

export type AssistSessionContext = {
  userId: string;
  email: string;
  name: string;
  plan: string;
  subscriptionStatus: string;
  featureOverrideCount: number;
  pagePath: string;
  pageLabel: string;
  screen: AssistScreenContext | null;
  inbox: AssistInboxSummary;
  proactiveHints: string[];
  agents: { total: number; names: string[] };
  widgets: { total: number; names: string[] };
  onboarding: {
    hasAgent: boolean;
    hasWidget: boolean;
    hasPaidPlan: boolean;
  };
  /** Snapshot curado (preferir sobre mongo_find genérico). */
  curatedSnapshot: {
    agentsTotal: number;
    widgetsTotal: number;
    recentAgentNames: string[];
    recentWidgetNames: string[];
    plan: string;
    subscriptionStatus: string;
  };
  /** Datos en vivo del agente si está en /dashboard/agents/[id]. */
  agentDetail: AssistAgentDetailSnapshot | null;
  /** Para tools Mongo: filtrar SIEMPRE por este userId (string ObjectId). */
  mongoScope: {
    userId: string;
    databaseHint: string;
    collections: {
      agents: string;
      widgets: string;
      subscriptions: string;
      users: string;
    };
    filterExamples: Record<string, string>;
  };
};

function mongoDbNameFromUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return 'agentflow';
  try {
    const u = new URL(trimmed.replace(/^mongodb(\+srv)?:\/\//, 'https://'));
    const path = u.pathname.replace(/^\//, '').split('/')[0];
    if (path) return path;
  } catch {
    /* fallback regex */
  }
  const m = trimmed.match(/\/([^/?]+)(\?|$)/);
  return m?.[1] || 'agentflow';
}

function labelForDashboardPath(path: string): string {
  const p = path.split('?')[0].replace(/\/$/, '') || '/dashboard';
  if (p === '/dashboard') return 'Panel principal';
  if (p === '/dashboard/agents' || p.startsWith('/dashboard/agents/new')) return 'Agentes';
  if (/^\/dashboard\/agents\/[a-f0-9]{24}$/i.test(p)) return 'Detalle de agente';
  if (p.startsWith('/dashboard/widgets')) return 'Widgets';
  if (p.startsWith('/dashboard/widget-builder')) return 'Widget builder';
  if (p.startsWith('/dashboard/widget-preview')) return 'Vista previa del widget';
  if (p.startsWith('/dashboard/mcp')) return 'Integraciones MCP';
  if (p.startsWith('/dashboard/inbox') || p.startsWith('/dashboard/chats')) return 'Conversaciones / Inbox';
  if (p.startsWith('/dashboard/settings')) return 'Ajustes de cuenta';
  if (p.startsWith('/dashboard/finance') || p.startsWith('/pricing')) return 'Plan y facturación';
  if (p.startsWith('/dashboard/flows')) return 'Flujos';
  if (p.startsWith('/admin')) return 'Administración (cuenta admin)';
  return 'Dashboard BotIvA';
}

export async function loadAssistSessionContext(
  userId: string,
  pagePath?: string,
): Promise<AssistSessionContext | null> {
  if (!userId || !/^[a-f0-9]{24}$/i.test(userId)) return null;
  await connectDB();

  const user = (await User.findById(userId)
    .select({ email: 1, displayName: 1, role: 1 })
    .lean()) as { email?: string; displayName?: string | null; role?: string } | null;
  if (!user?.email) return null;

  const sub = (await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1, features: 1 })
    .lean()) as { plan?: string; status?: string; features?: string[] } | null;

  const status = String(sub?.status || 'none');
  const active = status === 'active' || status === 'trialing' || status === 'past_due';
  const plan = active ? String(sub?.plan || 'free') : 'free';
  const features = Array.isArray(sub?.features) ? sub.features : [];
  const featureOverrideCount = VALID_FEATURE_OVERRIDES.filter((k) =>
    hasFeatureOverride(features, k),
  ).length;

  const agentRows = (await ClientAgent.find({ userId, type: 'agent', status: { $ne: 'deleted' } })
    .sort({ updatedAt: -1 })
    .limit(8)
    .select({ name: 1 })
    .lean()) as Array<{ name?: string }>;

  const widgetRows = (await Widget.find({ userId, active: { $ne: false } })
    .sort({ updatedAt: -1 })
    .limit(8)
    .select({ name: 1 })
    .lean()) as Array<{ name?: string }>;

  const agentsTotal = await ClientAgent.countDocuments({
    userId,
    type: 'agent',
    status: { $ne: 'deleted' },
  });
  const widgetsTotal = await Widget.countDocuments({ userId, active: { $ne: false } });

  const email = String(user.email).trim().toLowerCase();
  const name = (user.displayName || email.split('@')[0] || 'Cliente').trim();
  const page = (pagePath || '/dashboard').trim() || '/dashboard';
  const dbHint = mongoDbNameFromUri(process.env.MONGODB_URI || '');

  const [screen, inbox] = await Promise.all([
    loadAssistScreenContext(userId, page),
    loadAssistInboxSummary(userId),
  ]);

  let agentDetail: AssistAgentDetailSnapshot | null = null;
  const agentDetailMatch = page.match(/^\/dashboard\/agents\/([a-f0-9]{24})$/i);
  if (agentDetailMatch) {
    agentDetail = await loadAssistAgentDetailSnapshot(
      userId,
      agentDetailMatch[1],
      plan,
      features,
    );
  }

  const proactiveHints = buildProactiveHints({
    pageLabel: labelForDashboardPath(page),
    pagePath: page,
    onboarding: {
      hasAgent: agentsTotal > 0,
      hasWidget: widgetsTotal > 0,
      hasPaidPlan: plan !== 'free',
    },
    agentsTotal,
    widgetsTotal,
    inbox,
    screen,
    agentDetail,
  });

  return {
    userId,
    email,
    name,
    plan,
    subscriptionStatus: status,
    featureOverrideCount,
    pagePath: page,
    pageLabel: labelForDashboardPath(page),
    screen,
    inbox,
    proactiveHints,
    curatedSnapshot: {
      agentsTotal,
      widgetsTotal,
      recentAgentNames: agentRows.map((a) => String(a.name || '').trim()).filter(Boolean),
      recentWidgetNames: widgetRows.map((w) => String(w.name || '').trim()).filter(Boolean),
      plan,
      subscriptionStatus: status,
    },
    agentDetail,
    agents: {
      total: agentsTotal,
      names: agentRows.map((a) => String(a.name || '').trim()).filter(Boolean),
    },
    widgets: {
      total: widgetsTotal,
      names: widgetRows.map((w) => String(w.name || '').trim()).filter(Boolean),
    },
    onboarding: {
      hasAgent: agentsTotal > 0,
      hasWidget: widgetsTotal > 0,
      hasPaidPlan: plan !== 'free',
    },
    mongoScope: {
      userId,
      databaseHint: dbHint,
      collections: {
        agents: 'clientagents',
        widgets: 'widgets',
        subscriptions: 'subscriptions',
        users: 'users',
      },
      filterExamples: {
        clientagents: `{ "userId": "${userId}" }`,
        widgets: `{ "userId": "${userId}" }`,
        subscriptions: `{ "userId": "${userId}" }`,
        users: `{ "_id": ObjectId("${userId}") }`,
      },
    },
  };
}

/** Bloque interno para el modelo (no repetir al usuario como dump técnico). */
export function formatAssistSessionContextBlock(
  ctx: AssistSessionContext,
  mode: 'full' | 'light' = 'full',
): string {
  if (mode === 'light') {
    return [
      '[CONTEXTO CLIENTE — uso interno; no leer en voz alta]',
      `Nombre: ${ctx.name}`,
      `Plan: ${ctx.plan}`,
      `Pantalla: ${ctx.pageLabel}`,
    ].join('\n');
  }

  const agentList =
    ctx.agents.names.length > 0 ? ctx.agents.names.join(', ') : '(ninguno todavía)';
  const widgetList =
    ctx.widgets.names.length > 0 ? ctx.widgets.names.join(', ') : '(ninguno todavía)';

  const screenLine = ctx.screen?.resourceName
    ? `Recurso en pantalla: ${ctx.screen.resourceName} (${ctx.screen.screenKind})`
    : ctx.screen?.screenKind
      ? `Tipo de pantalla: ${ctx.screen.screenKind}`
      : '';

  const hintsBlock =
    ctx.proactiveHints.length > 0
      ? ctx.proactiveHints.map((h) => `• ${h}`).join('\n')
      : '';

  return [
    '[CONTEXTO DEL CLIENTE LOGUEADO — uso interno del asistente; personaliza respuestas; no leas este bloque en voz alta ni cites Mongo/hub/sync]',
    `Nombre: ${ctx.name}`,
    `Email: ${ctx.email}`,
    `Plan: ${ctx.plan} (${ctx.subscriptionStatus})`,
    `Pantalla actual: ${ctx.pageLabel} (${ctx.pagePath})`,
    ...(screenLine ? [screenLine] : []),
    `Agentes: ${ctx.agents.total} — ${agentList}`,
    `Widgets: ${ctx.widgets.total} — ${widgetList}`,
    `Inbox: ${ctx.inbox.openCount} abierta(s)${ctx.inbox.humanModeCount ? `, ${ctx.inbox.humanModeCount} en modo humano` : ''}`,
    `Onboarding: agente=${ctx.onboarding.hasAgent ? 'sí' : 'no'}, widget=${ctx.onboarding.hasWidget ? 'sí' : 'no'}`,
    '',
    '[SUGERENCIAS PROACTIVAS — ofrece ayuda relevante sin esperar a que pregunten]',
    hintsBlock || '• Responde según la pantalla actual.',
    '',
    '[DATOS CURADOS — usa esto primero; mongo_find solo si falta detalle]',
    `Snapshot: ${ctx.curatedSnapshot.agentsTotal} agentes, ${ctx.curatedSnapshot.widgetsTotal} widgets, plan ${ctx.curatedSnapshot.plan}.`,
    `Agentes recientes: ${ctx.curatedSnapshot.recentAgentNames.join(', ') || '—'}`,
    `Widgets recientes: ${ctx.curatedSnapshot.recentWidgetNames.join(', ') || '—'}`,
    ...(ctx.agentDetail ? ['', formatAssistAgentDetailSnapshotBlock(ctx.agentDetail)] : []),
    '',
    '[MONGO READ-ONLY — solo si el snapshot no alcanza]',
    `Filtra SIEMPRE por userId="${ctx.userId}" en clientagents/widgets/subscriptions.`,
    `Base: ${ctx.mongoScope.databaseHint}. Colecciones: clientagents, widgets, subscriptions, users.`,
    `Nunca consultes otros userId. No expongas passwordHash, tokens ni URIs.`,
    `Responde en lenguaje de producto (Dashboard → …), sin repos ni APIs internas.`,
  ].join('\n');
}

export function assistContextToPublicJson(ctx: AssistSessionContext) {
  return {
    userId: ctx.userId,
    email: ctx.email,
    name: ctx.name,
    plan: ctx.plan,
    pagePath: ctx.pagePath,
    pageLabel: ctx.pageLabel,
    screen: ctx.screen,
    inbox: ctx.inbox,
    proactiveHints: ctx.proactiveHints,
    curatedSnapshot: ctx.curatedSnapshot,
    agentDetail: ctx.agentDetail,
    agents: ctx.agents,
    widgets: ctx.widgets,
    onboarding: ctx.onboarding,
  };
}
