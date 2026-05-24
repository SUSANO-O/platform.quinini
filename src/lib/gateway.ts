/**
 * Precios públicos del producto widget → plan-catalog.ts.
 * (El gateway HTTP developer ya no se expone desde la landing.)
 */
import { buildAllPricingPlans, buildPricingGridPlans, type PlanInfo } from '@/lib/plan-catalog';

export { buildPricingGridPlans, type PlanInfo };

export const PLANS = buildAllPricingPlans();
