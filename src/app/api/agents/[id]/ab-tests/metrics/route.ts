/**
 * POST /api/agents/[id]/ab-tests/metrics
 *
 * Endpoint interno que actualiza las métricas de una variante. Exige el secreto interno
 * (`x-internal-secret` = HUB_TO_LANDING_SECRET): antes era público y cualquiera podía inflar
 * las métricas de un test A/B. El chat del widget ya no pasa por aquí (llama a
 * `recordAbVariantMetrics` directamente).
 *
 * Body: { variantId, durationSec?, escalated?, sentiment? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { recordAbVariantMetrics, type AbVariantMetricsInput } from '@/lib/ab-test-metrics';

type Params = { params: Promise<{ id: string }> };

function internalSecretOk(req: NextRequest): boolean {
  const expected = process.env.HUB_TO_LANDING_SECRET?.trim();
  const provided = req.headers.get('x-internal-secret')?.trim() ?? '';
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!internalSecretOk(req)) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
  }
  const { id: agentId } = await params;
  const body = (await req.json().catch(() => ({}))) as AbVariantMetricsInput;
  if (!body.variantId) return NextResponse.json({ ok: false }, { status: 400 });

  return NextResponse.json(await recordAbVariantMetrics(agentId, body));
}
