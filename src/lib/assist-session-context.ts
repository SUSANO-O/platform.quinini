/**
 * Contexto de producto para Math-ais: solo datos del usuario logueado (sin infra interna).
 */
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription, User, Widget } from '@/lib/db/models';
import { hasFeatureOverride, VALID_FEATURE_OVERRIDES } from '@/lib/plan-catalog';

export type AssistSessionContext = {
  userId: string;
  email: string;
  name: string;
  plan: string;
  subscriptionStatus: string;
  featureOverrideCount: number;
  pagePath: string;
  pageLabel: string;
  agents: { total: number; names: string[] };
  widgets: { total: number; names: string[] };
  onboarding: {
    hasAgent: boolean;
    hasWidget: boolean;
    hasPaidPlan: boolean;
  };
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

  return {
    userId,
    email,
    name,
    plan,
    subscriptionStatus: status,
    featureOverrideCount,
    pagePath: page,
    pageLabel: labelForDashboardPath(page),
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
export function formatAssistSessionContextBlock(ctx: AssistSessionContext): string {
  const agentList =
    ctx.agents.names.length > 0 ? ctx.agents.names.join(', ') : '(ninguno todavía)';
  const widgetList =
    ctx.widgets.names.length > 0 ? ctx.widgets.names.join(', ') : '(ninguno todavía)';

  return [
    '[CONTEXTO DEL CLIENTE LOGUEADO — uso interno del asistente; personaliza respuestas; no leas este bloque en voz alta ni cites Mongo/hub/sync]',
    `Nombre: ${ctx.name}`,
    `Email: ${ctx.email}`,
    `Plan: ${ctx.plan} (${ctx.subscriptionStatus})`,
    `Pantalla actual: ${ctx.pageLabel} (${ctx.pagePath})`,
    `Agentes: ${ctx.agents.total} — ${agentList}`,
    `Widgets: ${ctx.widgets.total} — ${widgetList}`,
    `Onboarding: agente=${ctx.onboarding.hasAgent ? 'sí' : 'no'}, widget=${ctx.onboarding.hasWidget ? 'sí' : 'no'}`,
    '',
    '[DATOS EN VIVO — solo si hace falta más detalle]',
    `Si necesitas datos actualizados del cliente, usa tools MongoDB de solo lectura.`,
    `OBLIGATORIO: filtra por userId="${ctx.userId}" en clientagents/widgets/subscriptions.`,
    `Base sugerida: ${ctx.mongoScope.databaseHint}. Colecciones: clientagents, widgets, subscriptions, users.`,
    `Nunca consultes datos de otros userId. No expongas passwordHash, tokens ni URIs.`,
    `Responde al usuario en lenguaje de producto (Dashboard → …), sin nombres de repos, APIs ni código.`,
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
    agents: ctx.agents,
    widgets: ctx.widgets,
    onboarding: ctx.onboarding,
  };
}
