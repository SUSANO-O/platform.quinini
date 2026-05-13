import { AbTest } from '@/lib/db/models';

export type AbVariant = {
  id: string;
  label: string;
  systemPrompt: string;
  trafficPct: number;
};

/**
 * Returns the active A/B variant for an agent, deterministically bucketed by sessionId.
 * Returns null if no running test exists for the agent.
 */
export async function getActiveVariant(
  agentId: string,
  sessionId: string,
): Promise<AbVariant | null> {
  const test = await AbTest.findOne({ agentId, status: 'running' })
    .select({ variants: 1 })
    .lean() as { variants: AbVariant[] } | null;

  if (!test) return null;
  const variants = test.variants;
  if (!variants.length) return null;

  // Deterministic bucket: hash sessionId to 0..99
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  const bucket = hash % 100;

  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.trafficPct;
    if (bucket < cumulative) return v;
  }
  return variants[variants.length - 1];
}
