import { planRank, type PlanId } from '@/lib/plan-catalog';

/**
 * Plan mínimo por integración MCP (landing). Alineado con agent-plans / negocio.
 * Claves deben coincidir con AIBackHub MCP_INTEGRATION_CATALOG.
 */
export const MCP_INTEGRATION_MIN_PLAN: Record<string, PlanId> = {
  mcp_standard: 'free',
  gmail: 'starter',
  /** Mismo mínimo que Gmail para conectar CRM en la misma franja de plan. */
  hubspot: 'starter',
  google_calendar: 'growth',
};

export function minPlanForMcpIntegration(key: string): PlanId {
  return MCP_INTEGRATION_MIN_PLAN[key] ?? 'free';
}

export function isMcpIntegrationAllowedForPlan(integrationKey: string, userPlan: string): boolean {
  const min = minPlanForMcpIntegration(integrationKey);
  return planRank(userPlan) >= planRank(min);
}

export function planLabelForMin(min: PlanId): string {
  const m: Record<PlanId, string> = {
    free: 'Free',
    starter: 'Starter',
    growth: 'Growth',
    business: 'Business',
    enterprise: 'Enterprise',
  };
  return m[min] ?? min;
}
