/**
 * Entitlements del dashboard — derivados de plan-catalog + overrides de suscripción.
 */

import { getAgentLimits } from '@/lib/agent-plans';
import {
  AGENT_WEBHOOK_MIN_PLAN,
  API_ACCESS_ADDON_PRICE_USD,
  API_ACCESS_FEATURE,
  CONVERSATION_ANALYTICS_ADVANCED_MIN_PLAN,
  CONVERSATION_ANALYTICS_MIN_PLAN,
  CONVERSATION_FLOWS_MIN_PLAN,
  CONVERSATION_FLOWS_FEATURE,
  CUSTOM_INTEGRATION_FEATURE,
  CUSTOM_INTEGRATION_MIN_PLAN,
  ESCALATION_SLACK_MIN_PLAN,
  ESCALATION_TICKET_MIN_PLAN,
  OUTBOUND_WEBHOOK_FEATURE,
  OUTBOUND_SAAS_WEBHOOK_MIN_PLAN,
  ESCALATION_SLACK_FEATURE,
  ESCALATION_TICKET_FEATURE,
  PLAN_DISPLAY,
  PLAN_RAG_LIMITS,
  SCHEDULED_TASKS_FEATURE,
  SHEET_NIGHTLY_SYNC_FEATURE,
  WHATSAPP_MIN_PLAN,
  WHATSAPP_FEATURE,
  apiAccessUpgradeLabel,
  canUseAgentWebhookTool,
  canUseApiAccess,
  canUseConversationFlows,
  canUseEscalationSlack,
  canUseEscalationTickets,
  canUseOutboundSaasWebhook,
  canUseWhatsApp,
  effectiveProductPlan,
  hasFeatureOverride,
  isApiOnlyPlan,
  planRank,
  scheduledTasksEnabled,
  sheetNightlySyncEnabled,
  type PlanId,
} from '@/lib/plan-catalog';

export type DashboardPlanFeature = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  /** Etiqueta del plan mínimo o add-on para desbloquear */
  unlockLabel: string;
  /** Concedido por admin vía subscription.features */
  viaOverride?: boolean;
  href?: string;
  group: 'core' | 'automation' | 'integrations';
};

function planLabel(planId: PlanId | string): string {
  return PLAN_DISPLAY[planId]?.label ?? String(planId);
}

function viaOverride(
  subscriptionFeatures: string[] | null | undefined,
  featureKey: string,
): boolean {
  return hasFeatureOverride(subscriptionFeatures, featureKey);
}

function canUseCustomIntegrations(
  plan: string,
  status: string,
  subscriptionFeatures?: string[] | null,
): boolean {
  if (hasFeatureOverride(subscriptionFeatures, CUSTOM_INTEGRATION_FEATURE)) return true;
  const effective = effectiveProductPlan(plan, status);
  return planRank(effective) >= planRank(CUSTOM_INTEGRATION_MIN_PLAN);
}

function conversationAnalyticsEnabled(plan: string): boolean {
  return planRank(plan) >= planRank(CONVERSATION_ANALYTICS_MIN_PLAN);
}

function conversationAnalyticsAdvanced(plan: string): boolean {
  return planRank(plan) >= planRank(CONVERSATION_ANALYTICS_ADVANCED_MIN_PLAN);
}

/** Lista ordenada de features para el panel del dashboard (respeta api_develop). */
export function buildDashboardPlanFeatures(
  plan: string,
  status: string,
  subscriptionFeatures?: string[] | null,
): DashboardPlanFeature[] {
  const effective = effectiveProductPlan(plan, status);
  const overrides = subscriptionFeatures ?? [];
  const limits = getAgentLimits(effective);
  const ragSpec = PLAN_RAG_LIMITS[effective];
  const apiOnly = isApiOnlyPlan(effective);

  const items: DashboardPlanFeature[] = [];

  if (!apiOnly) {
    items.push({
      key: 'widget_embed',
      label: 'Widget embebible',
      description: 'Chat en tu web con MatIAs personalizado.',
      enabled: true,
      unlockLabel: planLabel('free'),
      group: 'core',
      href: '/dashboard/widget-builder',
    });

    items.push({
      key: 'rag',
      label: 'Conocimiento RAG',
      description: ragSpec
        ? `Hasta ${ragSpec.sources} fuentes · ${ragSpec.mb >= 1024 ? `${Math.round(ragSpec.mb / 1024)} GB` : `${ragSpec.mb} MB`} por agente`
        : 'Sube PDFs, URLs y docs para que el agente responda con contexto.',
      enabled: limits.ragEnabled && ragSpec != null,
      unlockLabel: planLabel('team'),
      group: 'core',
      href: '/dashboard/agents',
    });

    items.push({
      key: 'agent_tools',
      label: 'Herramientas del agente',
      description: limits.availableToolIds.length > 0
        ? `${limits.availableToolIds.length} tools disponibles en tu plan`
        : 'Gmail, calendario, webhooks y más según plan.',
      enabled: limits.availableToolIds.length > 0,
      unlockLabel: planLabel('team'),
      group: 'core',
      href: '/dashboard/agents',
    });

    items.push({
      key: 'subagents',
      label: 'Sub-agentes',
      description: 'Agentes especializados ilimitados bajo el principal.',
      enabled: true,
      unlockLabel: planLabel('free'),
      group: 'core',
      href: '/dashboard/agents',
    });

    items.push({
      key: 'conversation_analytics',
      label: 'Analítica de conversaciones',
      description: conversationAnalyticsAdvanced(effective)
        ? 'Histórico extendido, export y métricas avanzadas'
        : conversationAnalyticsEnabled(effective)
          ? 'Métricas básicas de sesiones y satisfacción'
          : 'Sesiones, abandono, hora pico y satisfacción en el panel.',
      enabled: conversationAnalyticsEnabled(effective),
      unlockLabel: conversationAnalyticsAdvanced(effective)
        ? planLabel(CONVERSATION_ANALYTICS_ADVANCED_MIN_PLAN)
        : planLabel(CONVERSATION_ANALYTICS_MIN_PLAN),
      group: 'core',
      href: '/dashboard',
    });

    items.push({
      key: 'conversation_flows',
      label: 'Flujos conversacionales',
      description: 'Editor visual de flujos guiados (BETA).',
      enabled: canUseConversationFlows(plan, status, overrides),
      unlockLabel: planLabel(CONVERSATION_FLOWS_MIN_PLAN),
      viaOverride: viaOverride(overrides, CONVERSATION_FLOWS_FEATURE),
      group: 'automation',
      href: '/dashboard/flows',
    });

    items.push({
      key: 'scheduled_tasks',
      label: 'Tareas programadas',
      description: 'Cron por agente para informes y acciones recurrentes.',
      enabled: scheduledTasksEnabled(effective, overrides),
      unlockLabel: planLabel('plus'),
      viaOverride: viaOverride(overrides, SCHEDULED_TASKS_FEATURE),
      group: 'automation',
      href: '/dashboard/agents',
    });

    items.push({
      key: 'sheet_nightly_sync',
      label: 'Sync nocturno Sheets',
      description: 'Copia Google Sheets a Mongo cada noche (3 AM).',
      enabled: sheetNightlySyncEnabled(effective, overrides),
      unlockLabel: planLabel('plus'),
      viaOverride: viaOverride(overrides, SHEET_NIGHTLY_SYNC_FEATURE),
      group: 'automation',
    });

    items.push({
      key: 'escalation_slack',
      label: 'Slack al escalar',
      description: 'Aviso en Slack cuando un visitante pide humano.',
      enabled: canUseEscalationSlack(plan, status, overrides),
      unlockLabel: planLabel(ESCALATION_SLACK_MIN_PLAN),
      viaOverride: viaOverride(overrides, ESCALATION_SLACK_FEATURE),
      group: 'integrations',
      href: '/dashboard/inbox',
    });

    items.push({
      key: 'escalation_tickets',
      label: 'Tickets al escalar',
      description: 'Crea ticket en Zendesk/Freshdesk en handoff.',
      enabled: canUseEscalationTickets(plan, status, overrides),
      unlockLabel: planLabel(ESCALATION_TICKET_MIN_PLAN),
      viaOverride: viaOverride(overrides, ESCALATION_TICKET_FEATURE),
      group: 'integrations',
      href: '/dashboard/inbox',
    });
  }

  items.push({
    key: 'api_rest',
    label: 'API REST',
    description: apiOnly
      ? 'Integra MatIAs vía POST /agents/:id/chat con cupo dedicado.'
      : `Cupo API separado del widget · add-on +$${API_ACCESS_ADDON_PRICE_USD}/mes en Team+.`,
    enabled: canUseApiAccess(plan, status, overrides),
    unlockLabel: apiAccessUpgradeLabel(),
    viaOverride: viaOverride(overrides, API_ACCESS_FEATURE),
    group: apiOnly ? 'core' : 'integrations',
    href: '/dashboard/api',
  });

  if (!apiOnly) {
    items.push({
      key: 'agent_webhook',
      label: 'Webhook en agente',
      description: 'Tool HTTP saliente desde el chat del agente.',
      enabled: canUseAgentWebhookTool(effective),
      unlockLabel: planLabel(AGENT_WEBHOOK_MIN_PLAN),
      group: 'integrations',
      href: '/dashboard/agents',
    });

    items.push({
      key: 'outbound_webhook',
      label: 'Webhook saliente (HMAC)',
      description: 'Eventos firmados a tu backend (escalaciones, etc.).',
      enabled: canUseOutboundSaasWebhook(plan, status, overrides),
      unlockLabel: planLabel(OUTBOUND_SAAS_WEBHOOK_MIN_PLAN),
      viaOverride: viaOverride(overrides, OUTBOUND_WEBHOOK_FEATURE),
      group: 'integrations',
      href: '/dashboard/settings',
    });

    items.push({
      key: 'whatsapp',
      label: 'WhatsApp Business',
      description: 'Canal WhatsApp Cloud API con MatIAs.',
      enabled: canUseWhatsApp(plan, status, overrides),
      unlockLabel: planLabel(WHATSAPP_MIN_PLAN),
      viaOverride: viaOverride(overrides, WHATSAPP_FEATURE),
      group: 'integrations',
      href: '/dashboard/settings',
    });

    items.push({
      key: 'custom_mcp',
      label: 'Integraciones MCP avanzadas',
      description: 'MongoDB, Postgres y conectores de plan superior.',
      enabled: canUseCustomIntegrations(plan, status, overrides),
      unlockLabel: planLabel(CUSTOM_INTEGRATION_MIN_PLAN),
      viaOverride: viaOverride(overrides, CUSTOM_INTEGRATION_FEATURE),
      group: 'integrations',
      href: '/dashboard/agents',
    });
  }

  return items;
}

export function countEnabledFeatures(features: DashboardPlanFeature[]): number {
  return features.filter((f) => f.enabled).length;
}
