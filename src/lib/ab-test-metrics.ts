import { connectDB } from '@/lib/db/connection';
import { AbTest } from '@/lib/db/models';

export type AbVariantMetricsInput = {
  variantId?: string;
  durationSec?: number;
  escalated?: boolean;
  sentiment?: 'positive' | 'neutral' | 'negative';
};

export type AbVariantMetricsResult = { ok: true } | { ok: false; reason: string };

/**
 * Suma una sesión a la variante del test A/B en curso del agente.
 * La llama el chat del widget directamente (antes iba por un endpoint HTTP sin autenticación,
 * que cualquiera podía usar para inflar las métricas de un test).
 */
export async function recordAbVariantMetrics(
  agentId: string,
  body: AbVariantMetricsInput,
): Promise<AbVariantMetricsResult> {
  if (!agentId || !body.variantId) return { ok: false, reason: 'bad request' };

  await connectDB();

  const test = await AbTest.findOne({ agentId, status: 'running' });
  if (!test) return { ok: false, reason: 'no running test' };

  const variant = (test.variants as {
    id: string;
    sessions: number;
    escalations: number;
    positiveResponses: number;
    avgDurationSec: number;
  }[]).find((v) => v.id === body.variantId);

  if (!variant) return { ok: false, reason: 'variant not found' };

  // Media móvil incremental de la duración.
  const prevSessions = variant.sessions;
  variant.sessions += 1;
  if (body.durationSec && body.durationSec > 0) {
    variant.avgDurationSec = (variant.avgDurationSec * prevSessions + body.durationSec) / variant.sessions;
  }
  if (body.escalated) variant.escalations += 1;
  if (body.sentiment === 'positive') variant.positiveResponses += 1;

  test.markModified('variants');
  await test.save();

  return { ok: true };
}
