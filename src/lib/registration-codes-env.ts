import { PLAN_ORDER, type PlanId } from '@/lib/plan-catalog';

const VALID_PLANS = new Set<string>(PLAN_ORDER);

export const DEFAULT_REGISTRATION_TRIAL_DAYS = 7;

export type RegistrationCodeEntry = {
  plan: PlanId;
  trialDays: number;
};

/** Normaliza días de prueba (1–365). */
export function normalizeTrialDays(value: unknown, fallback = DEFAULT_REGISTRATION_TRIAL_DAYS): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(365, Math.floor(n)));
}

/**
 * Parsea REGISTRATION_CODES=CODIGO:plan,CODIGO2:plan:dias
 * El tercer segmento opcional son días de prueba (default 7).
 */
export function parseRegistrationCodesEnv(raw?: string): Map<string, RegistrationCodeEntry> {
  const map = new Map<string, RegistrationCodeEntry>();
  if (!raw?.trim()) return map;

  for (const part of raw.split(',')) {
    const segment = part.trim();
    if (!segment) continue;
    const pieces = segment.split(':').map((p) => p.trim());
    if (pieces.length < 2) continue;
    const code = pieces[0].toUpperCase();
    const plan = pieces[1].toLowerCase();
    if (!code || !VALID_PLANS.has(plan)) continue;
    const trialDays =
      pieces.length >= 3 ? normalizeTrialDays(pieces[2]) : DEFAULT_REGISTRATION_TRIAL_DAYS;
    map.set(code, { plan: plan as PlanId, trialDays });
  }
  return map;
}

/** Plan asignado si el código coincide con REGISTRATION_CODES (sin contador de usos). */
export function resolveEnvRegistrationPlan(code: string): PlanId | null {
  return resolveEnvRegistrationCode(code)?.plan ?? null;
}

/** Plan + días de prueba desde REGISTRATION_CODES en .env. */
export function resolveEnvRegistrationCode(code: string): RegistrationCodeEntry | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const map = parseRegistrationCodesEnv(process.env.REGISTRATION_CODES);
  return map.get(normalized) ?? null;
}
