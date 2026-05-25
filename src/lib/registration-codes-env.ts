import { PLAN_ORDER, type PlanId } from '@/lib/plan-catalog';

const VALID_PLANS = new Set<string>(PLAN_ORDER);

/** Parsea REGISTRATION_CODES=CODIGO:plan,CODIGO2:plan2 */
export function parseRegistrationCodesEnv(raw?: string): Map<string, PlanId> {
  const map = new Map<string, PlanId>();
  if (!raw?.trim()) return map;

  for (const part of raw.split(',')) {
    const segment = part.trim();
    if (!segment) continue;
    const colon = segment.indexOf(':');
    if (colon <= 0) continue;
    const code = segment.slice(0, colon).trim().toUpperCase();
    const plan = segment.slice(colon + 1).trim().toLowerCase();
    if (!code || !VALID_PLANS.has(plan)) continue;
    map.set(code, plan as PlanId);
  }
  return map;
}

/** Plan asignado si el código coincide con REGISTRATION_CODES (sin contador de usos). */
export function resolveEnvRegistrationPlan(code: string): PlanId | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const map = parseRegistrationCodesEnv(process.env.REGISTRATION_CODES);
  return map.get(normalized) ?? null;
}
