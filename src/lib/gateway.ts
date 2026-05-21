const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3100';

export function gatewayUrl(path: string) {
  return `${GATEWAY_URL}/api/gateway/${path}`;
}

export function gatewayAdminUrl(path: string) {
  return `${GATEWAY_URL}/api/${path}`;
}

export async function gatewayFetch(
  path: string,
  apiKey: string,
  options?: RequestInit,
) {
  const url = gatewayUrl(path);
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...options?.headers,
    },
  });
}

export type Agent = {
  _id: string;
  name: string;
  description: string;
  status: string;
  type: string;
  systemPrompt?: string;
  tools?: string[];
};

/**
 * Precios públicos del producto widget → plan-catalog.ts.
 * Este archivo solo expone utilidades HTTP hacia agent-flow-gateway (infra API).
 */
import { buildAllPricingPlans, buildPricingGridPlans, type PlanInfo } from '@/lib/plan-catalog';

export { buildPricingGridPlans, type PlanInfo };

/** Lista completa de planes (free → enterprise) para tablas comparativas. */
export const PLANS = buildAllPricingPlans();
