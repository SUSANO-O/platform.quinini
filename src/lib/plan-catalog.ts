/**
 * Fuente única de verdad — planes BotIvA (widget SaaS no-code).
 * Todo pricing público, límites de producto y packs deben importarse desde aquí.
 *
 * Nota: agent-flow-gateway tiene planes API para developers (infra interna);
 * no usar esos precios en la landing ni el dashboard de widgets.
 */

export const PLAN_ORDER = [
  'free',
  'solo',
  'api_develop',
  'team',
  'plus',
  'business',
  'enterprise',
] as const;

export type PlanId = (typeof PLAN_ORDER)[number];

export type PaidPlanId = 'solo' | 'api_develop' | 'team' | 'plus' | 'business';

/** Plan solo API REST — sin panel de widgets ni builder. */
export const API_ONLY_PLAN_ID = 'api_develop' as const;

export const API_ONLY_DASHBOARD_PATHS = ['/dashboard/api', '/dashboard/settings'] as const;

export function isApiOnlyPlan(plan: string): boolean {
  return plan === API_ONLY_PLAN_ID;
}

export function isApiOnlyDashboardPath(pathname: string): boolean {
  return API_ONLY_DASHBOARD_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Planes retirados — vacío. Los planes 'basic', 'starter', 'growth' fueron
 * eliminados por margen insuficiente. Los usuarios existentes fueron migrados
 * a 'plus'. Se mantiene este export vacío por compat con código que aún lo importe.
 */
export const LEGACY_PLAN_IDS = [] as const;
export type LegacyPlanId = never;

/** Planes de pago disponibles para checkout y pricing público. */
export const PAID_PLAN_IDS: PaidPlanId[] = [
  'solo',
  'api_develop',
  'team',
  'plus',
  'business',
];

/** Planes visibles en la landing (conversión). */
export const LANDING_PLAN_IDS: PaidPlanId[] = ['team', 'plus', 'business'];

/** Grid principal en /pricing (Team se mantiene; API Develop se añade). */
export const PRICING_GRID_PLAN_IDS: PaidPlanId[] = [
  'solo',
  'team',
  'plus',
  'business',
  'api_develop',
];

/**
 * Planes en modal de trial expirado y botones de upgrade.
 * Deben coincidir con LEMONSQUEEZY_VARIANT_* en .env.
 */
export const CHECKOUT_UPGRADE_PLAN_IDS: PaidPlanId[] = [
  'solo',
  'api_develop',
  'team',
  'plus',
  'business',
];

/** Precios jun 2026 — Team/Plus +19%; API al precio histórico de Team ($29). */
export const PLAN_PRICES_USD: Record<PaidPlanId, number> = {
  solo: 7,
  api_develop: 29,
  team: 35,
  plus: 50,
  business: 749,
};

/** Precios legacy — vacío. Planes eliminados, usuarios migrados a Plus. */
export const LEGACY_PLAN_PRICES_USD: Record<string, number> = {};

export function isLegacyPlan(_plan: string): _plan is never {
  return false;
}

export function isSellablePaidPlan(plan: string): plan is PaidPlanId {
  return (PAID_PLAN_IDS as readonly string[]).includes(plan);
}

/** Cualquier plan de producto con facturación (incluye legacy y enterprise). */
export function isPaidProductPlan(plan: string): boolean {
  return plan !== 'free' && (PLAN_ORDER as readonly string[]).includes(plan);
}

const PLAN_LABELS: Record<PlanId, string> = {
  free: 'Free',
  solo: 'Solo',
  api_develop: 'API Develop',
  team: 'Team',
  plus: 'Plus',
  business: 'Business',
  enterprise: 'Enterprise',
};

/** Etiqueta de precio mensual para UI ($7/mes, Contacto, etc.). */
export function formatPlanPriceLabel(usd: number): string {
  if (usd < 0) return 'Contacto';
  if (usd === 0) return '$0';
  return `$${usd}/mes`;
}

/** Etiqueta one-time para packs ($15, etc.). */
export function formatPackPriceLabel(usd: number): string {
  return `$${usd}`;
}

export const PLAN_DISPLAY: Record<
  string,
  { label: string; priceLabel: string; priceUsd: number }
> = Object.fromEntries(
  PLAN_ORDER.map((id) => {
    const label = PLAN_LABELS[id];
    const priceUsd =
      id in PLAN_PRICES_USD
        ? PLAN_PRICES_USD[id as PaidPlanId]
        : isLegacyPlan(id)
          ? LEGACY_PLAN_PRICES_USD[id]
          : id === 'free'
            ? 0
            : -1;
    return [
      id,
      {
        label,
        priceUsd,
        priceLabel: formatPlanPriceLabel(priceUsd),
      },
    ];
  }),
);

/** Conversaciones incluidas por mes — pool **agentes/widget** (-1 = ilimitado). */
export const PLAN_AGENT_CONVERSATION_LIMITS: Record<string, number> = {
  free:       50,
  solo:       300,
  api_develop:        0,
  team:       2_000,
  plus:       3_000,
  business:   45_000,
  enterprise: -1,
};

/** Conversaciones incluidas por mes — pool **API REST** (plan API Develop). */
export const PLAN_API_CONVERSATION_LIMITS: Record<string, number> = {
  free:       0,
  solo:       0,
  api_develop:        2_000,
  team:       0,
  plus:       0,
  business:   0,
  enterprise: -1,
};

/** Add-on mensual `api_access`: cupo API separado del widget (Team+). */
export const API_ACCESS_ADDON_CONVERSATIONS = 2_000;
export const API_ACCESS_ADDON_PRICE_USD = 19;

/** Alias histórico — conversaciones de agentes/widget. */
export const PLAN_CONVERSATION_LIMITS = PLAN_AGENT_CONVERSATION_LIMITS;

/** Agentes principales por plan (límite realista para PME). `-1` = ilimitado. */
export const PLAN_AGENT_LIMITS: Record<string, number> = {
  free:       1,
  solo:       4,   // +15% desde 3
  api_develop:        7,   // +15% desde 6
  team:       6,   // +15% desde 5
  plus:       12,  // +15% desde 10
  business:   -1,
  enterprise: 999,
};

/** `-1` = sin límite práctico en producto. */
export function formatAgentLimit(n: number): string {
  if (n < 0) return 'Ilimitados';
  return String(n);
}

export function isAgentLimitReached(used: number, limit: number): boolean {
  return limit >= 0 && used >= limit;
}

export const PLAN_SUBAGENT_LIMITS: Record<string, number> = {
  free:       0,
  solo:       0,
  api_develop:        0,
  team:       3,   // +15% desde 2
  plus:       6,   // +15% desde 5
  business:   58,  // +15% desde 50
  enterprise: 999,
};

export const PLAN_TOOLS_LIMITS: Record<string, number> = {
  free:       2,
  solo:       0,
  api_develop:        0,
  team:       6,
  plus:       8,
  business:   999,
  enterprise: 999,
};

// ── TAREAS PROGRAMADAS (cron por agente) ─────────────────────────────────────
// Acceso por DEFECTO desde Plus. Team y planes inferiores solo por override de
// admin (subscription.features incluye 'scheduled_tasks'). Los límites siempre
// salen del plan; un override sobre un plan sin cupo recibe cortesía de 3.

export const SCHEDULED_TASKS_FEATURE = 'scheduled_tasks';
/** Sync nocturno Google Sheets → Mongo (3 AM). Incluido desde Plus. */
export const SHEET_NIGHTLY_SYNC_FEATURE = 'sheet_nightly_sync';
/** Precio por GB almacenado en snapshots (facturación opt-in). */
export const SHEET_SYNC_USD_PER_GB = 1;

/** Máx. tareas por agente. `-1` = ilimitado. 0 = sin cupo propio (solo override → 3). */
export const PLAN_SCHEDULED_TASK_LIMITS: Record<string, number> = {
  free:       0,
  solo:       0,
  api_develop:        0,
  team:       3,
  plus:       5,
  business:   100,
  enterprise: -1,
};

/** Intervalo mínimo permitido entre corridas (minutos). Anti-abuso de costo. */
export const PLAN_SCHEDULED_TASK_MIN_INTERVAL_MIN: Record<string, number> = {
  free:       60,
  solo:       60,
  api_develop:        60,
  team:       60,
  plus:       30,
  business:   1,
  enterprise: 1,
};

/** Plan mínimo con acceso por defecto a Tareas Programadas. */
const SCHEDULED_TASKS_MIN_PLAN: PlanId = 'plus';
const SHEET_NIGHTLY_SYNC_MIN_PLAN: PlanId = 'plus';

/**
 * ¿El cliente puede usar Tareas Programadas?
 * true si su plan es >= Plus, O si su suscripción tiene el override del feature.
 */
export function scheduledTasksEnabled(plan: string, subscriptionFeatures?: string[] | null): boolean {
  if (Array.isArray(subscriptionFeatures) && subscriptionFeatures.includes(SCHEDULED_TASKS_FEATURE)) {
    return true;
  }
  const idx = PLAN_ORDER.indexOf(plan as PlanId);
  return idx >= 0 && idx >= PLAN_ORDER.indexOf(SCHEDULED_TASKS_MIN_PLAN);
}

/** ¿Puede activar sync nocturno Sheet → Mongo? (Plus+ o override admin). */
export function sheetNightlySyncEnabled(plan: string, subscriptionFeatures?: string[] | null): boolean {
  if (hasFeatureOverride(subscriptionFeatures, SHEET_NIGHTLY_SYNC_FEATURE)) return true;
  return planRank(plan) >= planRank(SHEET_NIGHTLY_SYNC_MIN_PLAN);
}

/** Facturación $/GB habilitada globalmente (env) y por suscripción. */
export function sheetSyncBillingActive(
  subscriptionBillingEnabled?: boolean | null,
): boolean {
  const globalOn = process.env.SHEET_SYNC_BILLING_ENABLED === '1'
    || process.env.SHEET_SYNC_BILLING_ENABLED === 'true';
  return globalOn && subscriptionBillingEnabled === true;
}

export function sheetSyncChargeUsd(byteSize: number): number {
  if (!Number.isFinite(byteSize) || byteSize <= 0) return 0;
  const gb = byteSize / (1024 ** 3);
  return Math.round(gb * SHEET_SYNC_USD_PER_GB * 100) / 100;
}

/** Máx. tareas efectivo. `hasAccess` aplica la cortesía de 3 a overrides sin cupo de plan. */
export function getScheduledTaskLimit(plan: string, hasAccess: boolean): number {
  const base = PLAN_SCHEDULED_TASK_LIMITS[plan] ?? 0;
  if (base !== 0) return base; // incluye -1 (ilimitado) y positivos
  return hasAccess ? 3 : 0;
}

/**
 * Límite efectivo considerando un override manual por cliente.
 * `customLimit` (subscription.scheduledTaskLimit): número = manda (incl. -1 ilimitado);
 * null/undefined = usar el del plan.
 */
export function effectiveScheduledTaskLimit(
  plan: string,
  hasAccess: boolean,
  customLimit?: number | null,
): number {
  if (typeof customLimit === 'number' && Number.isFinite(customLimit)) return customLimit;
  return getScheduledTaskLimit(plan, hasAccess);
}

/** Intervalo mínimo (min) entre corridas para el plan. */
export function getScheduledTaskMinIntervalMin(plan: string): number {
  return PLAN_SCHEDULED_TASK_MIN_INTERVAL_MIN[plan] ?? 60;
}

/** Solicitudes por minuto (rate limit técnico). */
export const PLAN_RATE_LIMITS_PER_MIN: Record<string, number> = {
  free:       10,
  solo:       20,
  api_develop:        35,
  team:       35,
  plus:       40,
  business:   300,
  enterprise: 600,
};

/** Retención de historial de conversaciones en días (-1 = ilimitado). */
export const PLAN_HISTORY_RETENTION_DAYS: Record<string, number> = {
  free:       7,
  solo:       30,
  api_develop:        45,
  team:       45,
  plus:       60,
  business:   -1,
  enterprise: -1,
};

/** Límite de conocimiento RAG por agente (null = no habilitado). */
export const PLAN_RAG_LIMITS: Record<string, { mb: number; sources: number } | null> = {
  free:       null,
  solo:       null,
  api_develop:        null,
  team:       { mb: 128,     sources: 15   },
  plus:       { mb: 256,     sources: 20   },
  business:   { mb: 102_400, sources: 2_000 },
  enterprise: { mb: 999_999, sources: 9_999 },
};

/**
 * Packs one-time — precio por conversación siempre por encima del plan equivalente
 * para incentivar upgrades (no canibalizar Starter/Growth).
 */
const PACK_SPECS = [
  { id: 'pack_s', label: 'Pack S', conversations: 1_000,  price: 15  },
  { id: 'pack_m', label: 'Pack M', conversations: 5_000,  price: 60  },
  { id: 'pack_l', label: 'Pack L', conversations: 15_000, price: 170 },
] as const;

export type PackId = (typeof PACK_SPECS)[number]['id'];

export const CONVERSATION_PACKS = PACK_SPECS.map((p) => ({
  ...p,
  priceLabel: formatPackPriceLabel(p.price),
}));

/** Solo suscriptores de pago pueden comprar packs (free no). */
export const PACK_ELIGIBLE_PLANS = new Set<string>([...PAID_PLAN_IDS, ...LEGACY_PLAN_IDS]);

export function canPurchaseConversationPacks(plan: string, status: string): boolean {
  const effective = ['active', 'trialing'].includes(status) ? plan : 'free';
  return PACK_ELIGIBLE_PLANS.has(effective);
}

/** Plan mínimo para herramienta Webhook en el agente (llamadas salientes del chat). */
export const AGENT_WEBHOOK_MIN_PLAN: PlanId = 'team';

/** Plan mínimo para webhook SaaS saliente (eventos firmados a tu backend). */
export const OUTBOUND_SAAS_WEBHOOK_MIN_PLAN: PlanId = 'plus';

/** Plan mínimo para avisar en Slack al escalar (Incoming Webhook en Cumplimiento). */
export const ESCALATION_SLACK_MIN_PLAN: PlanId = 'team';

/** Plan mínimo de panel para contratar add-on API (Team+). No implica API incluida. */
export const API_ADDON_ELIGIBLE_MIN_PLAN: PlanId = 'team';

/** @deprecated Usar API_ADDON_ELIGIBLE_MIN_PLAN — ya no hay API incluida por rank de plan. */
export const API_ACCESS_MIN_PLAN: PlanId = API_ADDON_ELIGIBLE_MIN_PLAN;

/** Etiqueta pública en landing mientras la API no está disponible en producción. */
export const API_REST_COMING_SOON_LABEL = 'Próximamente';

/** Plan mínimo para analytics de conversaciones (dashboard widget). */
export const CONVERSATION_ANALYTICS_MIN_PLAN: PlanId = 'plus';

/** Plan mínimo para flujos conversacionales (editor visual + embed). */
export const CONVERSATION_FLOWS_MIN_PLAN: PlanId = 'plus';

/** Plan mínimo para analytics avanzado (export, histórico extendido). */
export const CONVERSATION_ANALYTICS_ADVANCED_MIN_PLAN: PlanId = 'business';

/** Plan mínimo para creación de tickets al escalar (handoff + integraciones). */
export const ESCALATION_TICKET_MIN_PLAN: PlanId = 'business';

/** Plan mínimo para integraciones custom (MCP completo, a medida). */
export const CUSTOM_INTEGRATION_MIN_PLAN: PlanId = 'business';

/** Plan mínimo para la integración con WhatsApp Business (Cloud API). */
export const WHATSAPP_MIN_PLAN: PlanId = 'business';

/**
 * Clave de override por usuario (subscription.features). Permite a un admin
 * conceder WhatsApp a un plan inferior sin cambiar el plan del cliente
 * (ej. acuerdo de precio aparte), igual que [[SCHEDULED_TASKS_FEATURE]].
 */
export const WHATSAPP_FEATURE = 'whatsapp';

/** Claves de override por usuario para el resto de features de plan superior. */
export const OUTBOUND_WEBHOOK_FEATURE = 'outbound_webhook';
export const ESCALATION_SLACK_FEATURE = 'escalation_slack';
export const ESCALATION_TICKET_FEATURE = 'escalation_tickets';
export const API_ACCESS_FEATURE = 'api_access';
export const CONVERSATION_FLOWS_FEATURE = 'conversation_flows';
export const CUSTOM_INTEGRATION_FEATURE = 'custom_integration';

/**
 * Catálogo único de overrides de feature que un admin puede conceder por usuario
 * vía `subscription.features`. Fuente de verdad para la allowlist del endpoint
 * admin y para los checkboxes del modal de gestión de suscripción.
 */
export const FEATURE_OVERRIDES: { key: string; label: string; description: string }[] = [
  { key: SCHEDULED_TASKS_FEATURE,   label: 'Tareas Programadas',   description: 'Cron por agente. Incluido desde Plus por defecto.' },
  { key: SHEET_NIGHTLY_SYNC_FEATURE, label: 'Sync nocturno Sheets', description: 'Copia Sheets a Mongo a las 3 AM. Incluido desde Plus.' },
  { key: WHATSAPP_FEATURE,          label: 'WhatsApp Business',    description: 'Integración WhatsApp Cloud API. Incluido desde Business por defecto.' },
  { key: OUTBOUND_WEBHOOK_FEATURE,  label: 'Webhook saliente (HMAC)', description: 'Eventos firmados a tu backend. Incluido desde Plus por defecto.' },
  { key: ESCALATION_SLACK_FEATURE,  label: 'Slack al escalar',     description: 'Aviso a Slack en handoff. Incluido desde Team por defecto.' },
  { key: ESCALATION_TICKET_FEATURE, label: 'Tickets al escalar',   description: 'Zendesk/Freshdesk en handoff. Incluido desde Business por defecto.' },
  { key: API_ACCESS_FEATURE,        label: 'Acceso API REST (add-on)', description: `Add-on: +${API_ACCESS_ADDON_CONVERSATIONS.toLocaleString('es')} conv/mes vía API, cupo separado del widget. Requiere Team+ o API Develop.` },
  { key: CONVERSATION_FLOWS_FEATURE, label: 'Flujos conversacionales', description: 'Editor visual de flujos guiados. Incluido desde Plus por defecto.' },
  { key: CUSTOM_INTEGRATION_FEATURE, label: 'Integraciones custom (MCP)', description: 'Conectores MCP de plan superior (MongoDB, Postgres…). Incluido desde Business por defecto.' },
];

/** Lista plana de claves válidas para la allowlist del endpoint admin. */
export const VALID_FEATURE_OVERRIDES: string[] = FEATURE_OVERRIDES.map((f) => f.key);

/** ¿La suscripción tiene activado este override de feature? */
export function hasFeatureOverride(
  subscriptionFeatures: string[] | null | undefined,
  featureKey: string,
): boolean {
  return Array.isArray(subscriptionFeatures) && subscriptionFeatures.includes(featureKey);
}

/** Mínimos históricos — sin uso (planes legacy eliminados, usuarios migrados a Plus). */
const LEGACY_AGENT_WEBHOOK_MIN_PLAN: PlanId = 'team';
const LEGACY_OUTBOUND_SAAS_WEBHOOK_MIN_PLAN: PlanId = 'plus';
const LEGACY_ESCALATION_TICKET_MIN_PLAN: PlanId = 'plus';
const LEGACY_CONVERSATION_ANALYTICS_ADVANCED_MIN_PLAN: PlanId = 'plus';

function meetsProductMinimum(
  plan: string,
  sellableMin: PlanId,
  legacyMin: PlanId,
): boolean {
  const required = isLegacyPlan(plan) ? legacyMin : sellableMin;
  return planRank(plan) >= planRank(required);
}

const PAID_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

/** Plan efectivo para límites de producto (trialing/active/past_due conservan plan). */
export function effectiveProductPlan(plan: string, status: string): string {
  return PAID_SUBSCRIPTION_STATUSES.has(status) ? plan : 'free';
}

export function canUseAgentWebhookTool(plan: string): boolean {
  return meetsProductMinimum(plan, AGENT_WEBHOOK_MIN_PLAN, LEGACY_AGENT_WEBHOOK_MIN_PLAN);
}

export function canUseOutboundSaasWebhook(
  plan: string,
  status: string,
  subscriptionFeatures?: string[] | null,
): boolean {
  if (hasFeatureOverride(subscriptionFeatures, OUTBOUND_WEBHOOK_FEATURE)) return true;
  const effective = effectiveProductPlan(plan, status);
  return meetsProductMinimum(
    effective,
    OUTBOUND_SAAS_WEBHOOK_MIN_PLAN,
    LEGACY_OUTBOUND_SAAS_WEBHOOK_MIN_PLAN,
  );
}

export function planHasAgentWebhookFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(AGENT_WEBHOOK_MIN_PLAN);
}

export function planHasOutboundWebhookFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(OUTBOUND_SAAS_WEBHOOK_MIN_PLAN);
}

export function planHasEscalationSlackFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(ESCALATION_SLACK_MIN_PLAN);
}

export function getAgentConversationLimit(plan: string): number {
  if (isApiOnlyPlan(plan)) return 0;
  return PLAN_AGENT_CONVERSATION_LIMITS[plan] ?? PLAN_AGENT_CONVERSATION_LIMITS.free;
}

export function getApiConversationLimit(
  plan: string,
  subscriptionFeatures?: string[] | null,
): number {
  if (isApiOnlyPlan(plan)) {
    return PLAN_API_CONVERSATION_LIMITS[plan] ?? 0;
  }
  if (hasFeatureOverride(subscriptionFeatures, API_ACCESS_FEATURE)) {
    return API_ACCESS_ADDON_CONVERSATIONS;
  }
  return PLAN_API_CONVERSATION_LIMITS[plan] ?? 0;
}

export function getConversationLimitForPool(
  plan: string,
  pool: 'agents' | 'api',
  subscriptionFeatures?: string[] | null,
): number {
  return pool === 'api'
    ? getApiConversationLimit(plan, subscriptionFeatures)
    : getAgentConversationLimit(plan);
}

export function planHasApiAccessFeature(planId: PlanId): boolean {
  return isApiOnlyPlan(planId);
}

/** API REST: solo plan API Develop o add-on `api_access` (admin/checkout). */
export function canUseApiAccess(
  plan: string,
  status: string,
  subscriptionFeatures?: string[] | null,
): boolean {
  if (hasFeatureOverride(subscriptionFeatures, API_ACCESS_FEATURE)) return true;
  const effective = effectiveProductPlan(plan, status);
  return isApiOnlyPlan(effective);
}

/** ¿Puede contratar el add-on API? (Team+ activo, sin API ya activa). */
export function canPurchaseApiAccessAddon(
  plan: string,
  status: string,
  subscriptionFeatures?: string[] | null,
): boolean {
  if (hasFeatureOverride(subscriptionFeatures, API_ACCESS_FEATURE)) return false;
  if (isApiOnlyPlan(plan)) return false;
  const effective = effectiveProductPlan(plan, status);
  return planRank(effective) >= planRank(API_ADDON_ELIGIBLE_MIN_PLAN);
}

/** Flujos conversacionales — Plus+ con suscripción activa, o por override de admin. */
export function canUseConversationFlows(
  plan: string,
  status: string,
  subscriptionFeatures?: string[] | null,
): boolean {
  if (hasFeatureOverride(subscriptionFeatures, CONVERSATION_FLOWS_FEATURE)) return true;
  const effective = effectiveProductPlan(plan, status);
  return planRank(effective) >= planRank(CONVERSATION_FLOWS_MIN_PLAN);
}

export function planHasConversationFlowsFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(CONVERSATION_FLOWS_MIN_PLAN);
}

export function conversationFlowsUpgradeLabel(): string {
  return PLAN_DISPLAY[CONVERSATION_FLOWS_MIN_PLAN]?.label ?? 'Plus';
}

/** Notificaciones Slack al escalar con suscripción activa (Team+), o por override. */
export function canUseEscalationSlack(
  plan: string,
  status: string,
  subscriptionFeatures?: string[] | null,
): boolean {
  if (hasFeatureOverride(subscriptionFeatures, ESCALATION_SLACK_FEATURE)) return true;
  const effective = effectiveProductPlan(plan, status);
  return meetsProductMinimum(effective, ESCALATION_SLACK_MIN_PLAN, ESCALATION_SLACK_MIN_PLAN);
}

/** Tickets al escalar — Business+ en venta; Growth legacy conserva acceso; o por override. */
export function canUseEscalationTickets(
  plan: string,
  status: string,
  subscriptionFeatures?: string[] | null,
): boolean {
  if (hasFeatureOverride(subscriptionFeatures, ESCALATION_TICKET_FEATURE)) return true;
  const effective = effectiveProductPlan(plan, status);
  return meetsProductMinimum(
    effective,
    ESCALATION_TICKET_MIN_PLAN,
    LEGACY_ESCALATION_TICKET_MIN_PLAN,
  );
}

export function apiAccessUpgradeLabel(): string {
  return `API Develop o add-on (+$${API_ACCESS_ADDON_PRICE_USD}/mes)`;
}

/** Etiqueta API en tablas comparativas. */
export function formatApiAccessFeature(planId: PlanId): string {
  if (isApiOnlyPlan(planId)) return 'Incluido';
  if (planRank(planId) >= planRank(API_ADDON_ELIGIBLE_MIN_PLAN)) {
    return `Add-on $${API_ACCESS_ADDON_PRICE_USD}/mes`;
  }
  return '—';
}

/** Etiqueta para tabla comparativa: — | Básico | Avanzado | Completo */
export function formatConversationAnalyticsFeature(planId: PlanId): string {
  if (planRank(planId) >= planRank('business')) return 'Completo';
  if (planRank(planId) >= planRank(CONVERSATION_ANALYTICS_ADVANCED_MIN_PLAN)) return 'Avanzado';
  if (planRank(planId) >= planRank(CONVERSATION_ANALYTICS_MIN_PLAN)) return 'Básico';
  return '—';
}

export function planHasEscalationTicketFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(ESCALATION_TICKET_MIN_PLAN);
}

export function planHasCustomIntegrationFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(CUSTOM_INTEGRATION_MIN_PLAN);
}

/** ¿El plan incluye la integración con WhatsApp Business? (para tablas/pricing). */
export function planHasWhatsAppFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(WHATSAPP_MIN_PLAN);
}

/**
 * Integración WhatsApp Business.
 * true si: (a) el override `whatsapp` está en subscription.features (concedido
 * manualmente por admin a cualquier plan), O (b) el plan vigente es Business+.
 */
export function canUseWhatsApp(
  plan: string,
  status: string,
  subscriptionFeatures?: string[] | null,
): boolean {
  if (hasFeatureOverride(subscriptionFeatures, WHATSAPP_FEATURE)) return true;
  const effective = effectiveProductPlan(plan, status);
  return planRank(effective) >= planRank(WHATSAPP_MIN_PLAN);
}

export function whatsappUpgradeLabel(): string {
  return PLAN_DISPLAY[WHATSAPP_MIN_PLAN]?.label ?? 'Business';
}

export function outboundWebhookUpgradeLabel(): string {
  return PLAN_DISPLAY[OUTBOUND_SAAS_WEBHOOK_MIN_PLAN]?.label ?? 'Plus';
}

export function escalationSlackUpgradeLabel(): string {
  return PLAN_DISPLAY[ESCALATION_SLACK_MIN_PLAN]?.label ?? 'Team';
}

export function escalationTicketUpgradeLabel(): string {
  return PLAN_DISPLAY[ESCALATION_TICKET_MIN_PLAN]?.label ?? 'Business';
}

export function planRank(plan: string): number {
  const i = PLAN_ORDER.indexOf(plan as PlanId);
  return i >= 0 ? i : 0;
}

export function planChangeDirection(
  from: string,
  to: string,
): 'upgrade' | 'downgrade' | 'same' {
  const a = planRank(from);
  const b = planRank(to);
  if (b > a) return 'upgrade';
  if (b < a) return 'downgrade';
  return 'same';
}

/** Plan Solo ($7): chat básico sin herramientas, RAG, reglas ni widget avanzado. */
export function isSoloChatOnlyPlan(plan: string): boolean {
  return plan === 'solo';
}

/** Bullets para modales de cambio de plan y checkout (solo planes en venta). */
export const PLAN_FEATURE_BULLETS: Record<PaidPlanId, string[]> = {
  solo: [
    '300 conversaciones al mes (~10/día)',
    '4 agentes · solo chat (sin herramientas ni almacenamiento)',
    'Widgets básicos · historial 30 días',
    'Autoguiado: documentación y videos en YouTube',
    'Soporte por email (72 h, sin onboarding dedicado)',
  ],
  api_develop: [
    '2.000 conversaciones al mes vía API REST',
    '7 agentes · sin panel, widgets ni builder',
    'Auth con API key · documentación interactiva',
    'Endpoints de agentes, chat y claves ya disponibles',
    'Soporte por email (48 h)',
  ],
  team: [
    '2.000 conversaciones al mes (~65/día) — widget y agentes',
    '6 agentes · 3 sub-agentes · Webhook incluido',
    'Almacenamiento: 128 MB · 15 fuentes por agente',
    `API REST: add-on opcional (+$${API_ACCESS_ADDON_PRICE_USD}/mes, cupo API aparte) · Gmail y Slack · widgets ilimitados`,
    'Capacitación grupal · soporte email (48 h)',
  ],
  plus: [
    '3.000 conversaciones al mes (~100/día) — widget y agentes',
    '12 agentes · 6 sub-agentes · Webhook incluido',
    'Almacenamiento: 256 MB · 20 fuentes · búsqueda vectorial',
    `API REST: add-on opcional (+$${API_ACCESS_ADDON_PRICE_USD}/mes) · Flujos conversacionales (BETA) · webhook saliente (HMAC)`,
    'Tareas programadas · historial 60 días · soporte email (48 h)',
  ],
  business: [
    '45.000 conversaciones al mes (~1.500/día) — widget y agentes',
    'Agentes ilimitados · integraciones custom · MCP completo',
    `Integración WhatsApp Business · API REST add-on (+$${API_ACCESS_ADDON_PRICE_USD}/mes) · webhooks`,
    'Tickets al escalar · analytics completo (multi-agente) · Almac. 100 GB',
    'Historial ilimitado · todos los modelos · SLA 99,9 %',
  ],
};

/** Bullets legacy — vacío. Planes retirados, sin usuarios activos. */
export const LEGACY_PLAN_FEATURE_BULLETS: Record<string, string[]> = {};

/** Features cortas para tarjetas de pricing (español). */
export const PLAN_PRICING_FEATURES: Record<PlanId, string[]> = {
  free: [
    '50 conversaciones al mes',
    '1 agente · 2 herramientas',
    '1 widget · historial 7 días',
    'Comunidad y documentación',
  ],
  solo: PLAN_FEATURE_BULLETS.solo,
  api_develop: PLAN_FEATURE_BULLETS.api_develop,
  team: PLAN_FEATURE_BULLETS.team,
  plus: PLAN_FEATURE_BULLETS.plus,
  business: PLAN_FEATURE_BULLETS.business,
  enterprise: [
    'Conversaciones sin límite',
    'API REST (próximamente) · integraciones custom · analytics completo',
    'Tickets al escalar · acuerdos de volumen personalizados',
    'White-label disponible · soporte dedicado 24/7',
    'SLA empresarial personalizado',
  ],
};

export type PlanInfo = {
  id: PlanId;
  name: string;
  price: string;
  priceNote?: string;
  rateLimit: number;
  monthlyRequests: number;
  features: string[];
  highlighted?: boolean;
};

function fmtPrice(usd: number): string {
  return usd <= 0 ? '$0' : `$${usd}`;
}

/** Lista completa para tablas comparativas (/pricing). */
export function buildAllPricingPlans(): PlanInfo[] {
  const paidHighlighted: PaidPlanId = 'plus';
  const entries: PlanInfo[] = [
    ...PAID_PLAN_IDS.map((id) => ({
      id,
      name: PLAN_DISPLAY[id].label,
      price: fmtPrice(PLAN_PRICES_USD[id]),
      priceNote: '/mes',
      rateLimit: PLAN_RATE_LIMITS_PER_MIN[id],
      monthlyRequests: PLAN_CONVERSATION_LIMITS[id],
      features: PLAN_PRICING_FEATURES[id],
      highlighted: id === paidHighlighted,
    })),
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Contacto',
      rateLimit: PLAN_RATE_LIMITS_PER_MIN.enterprise,
      monthlyRequests: PLAN_CONVERSATION_LIMITS.enterprise,
      features: PLAN_PRICING_FEATURES.enterprise,
    },
  ];
  return entries;
}

/** Planes de pago para el grid principal de /pricing. */
export function planEmailLabel(planId: string): string {
  const d = PLAN_DISPLAY[planId];
  if (!d) return planId;
  if (planId === 'enterprise') return 'Enterprise';
  return d.priceUsd > 0 ? `${d.label} (${d.priceLabel})` : d.label;
}

/** Planes de pago para el grid principal de /pricing. */
export function buildPricingGridPlans(): PlanInfo[] {
  return buildAllPricingPlans().filter((p) =>
    PRICING_GRID_PLAN_IDS.includes(p.id as PaidPlanId),
  );
}
