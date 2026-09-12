import { Braces, Crown, Sparkles } from '@/components/ui/icons';

/**
 * Símbolo de cada plan. Vive acá para que la tarjeta de precios y el panel de
 * una cuenta suspendida muestren exactamente el mismo ícono.
 */
export const PLAN_ICONS: Record<string, typeof Crown> = {
  solo: Sparkles,
  api_develop: Braces,
  team: Sparkles,
  plus: Sparkles,
  business: Crown,
};

export function planIconFor(planId: string): typeof Crown {
  return PLAN_ICONS[planId] ?? Sparkles;
}
