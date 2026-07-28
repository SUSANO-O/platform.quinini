import type { MeteringContext, MeteringDecision, MeteringPolicy } from './types';

function roundBillableUnits(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Motor puro: dado contexto + políticas, devuelve cuánto descontar.
 * Sin I/O — fácil de testear y extender (promos, A/B, planes custom).
 */
export function resolveMetering(
  ctx: MeteringContext,
  policies: MeteringPolicy[],
): MeteringDecision {
  let billableUnits = 1;
  let limitMultiplier = 1;
  const appliedRules: string[] = [];

  const sorted = [...policies].sort((a, b) => a.priority - b.priority);

  for (const policy of sorted) {
    const patch = policy.apply(ctx);
    if (!patch) continue;

    if (typeof patch.billableUnits === 'number') {
      billableUnits = patch.billableUnits;
      appliedRules.push(`${policy.id}:units=${patch.billableUnits}`);
    }
    if (typeof patch.billableUnitsMultiplier === 'number') {
      billableUnits *= patch.billableUnitsMultiplier;
      appliedRules.push(`${policy.id}:units×${patch.billableUnitsMultiplier}`);
    }
    if (typeof patch.limitMultiplier === 'number') {
      limitMultiplier *= patch.limitMultiplier;
      appliedRules.push(`${policy.id}:limit×${patch.limitMultiplier}`);
    }
  }

  return {
    billableUnits: roundBillableUnits(billableUnits),
    channel: ctx.channel,
    appliedRules,
    limitMultiplier: roundBillableUnits(limitMultiplier),
  };
}
