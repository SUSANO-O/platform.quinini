import { planRank, PLAN_DISPLAY, hasFeatureOverride, CUSTOM_INTEGRATION_FEATURE, type PlanId } from '@/lib/plan-catalog';

/**
 * Plan mínimo por integración MCP (landing). Alineado con agent-plans / negocio.
 * Claves deben coincidir con AIBackHub MCP_INTEGRATION_CATALOG.
 */
export const MCP_INTEGRATION_MIN_PLAN: Record<string, PlanId> = {
  gmail: 'plus',
  hubspot: 'plus',
  google_calendar: 'plus',
  mongodb: 'business',
  postgres: 'business',
};

export function minPlanForMcpIntegration(key: string): PlanId {
  return MCP_INTEGRATION_MIN_PLAN[key] ?? 'free';
}

export function isMcpIntegrationAllowedForPlan(
  integrationKey: string,
  userPlan: string,
  subscriptionFeatures?: string[] | null,
): boolean {
  // Override de admin: 'custom_integration' desbloquea cualquier integración MCP.
  if (hasFeatureOverride(subscriptionFeatures, CUSTOM_INTEGRATION_FEATURE)) return true;
  const min = minPlanForMcpIntegration(integrationKey);
  return planRank(userPlan) >= planRank(min);
}

export function planLabelForMin(min: PlanId): string {
  return PLAN_DISPLAY[min]?.label ?? min;
}
