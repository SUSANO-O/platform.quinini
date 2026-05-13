/**
 * POST /api/agents/[id]/ab-tests/metrics
 *
 * Endpoint interno (sin auth de usuario) que actualiza las métricas
 * de una variante al cerrar una sesión. Llamado desde /api/widget/events.
 *
 * Body: { variantId, agentId, durationSec?, escalated?, sentiment? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { AbTest } from '@/lib/db/models';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: agentId } = await params;

  const body = await req.json() as {
    variantId?: string;
    durationSec?: number;
    escalated?: boolean;
    sentiment?: 'positive' | 'neutral' | 'negative';
  };

  if (!body.variantId) return NextResponse.json({ ok: false }, { status: 400 });

  await connectDB();

  const test = await AbTest.findOne({ agentId, status: 'running' });
  if (!test) return NextResponse.json({ ok: false, reason: 'no running test' });

  const variant = (test.variants as {
    id: string;
    sessions: number;
    escalations: number;
    positiveResponses: number;
    avgDurationSec: number;
  }[]).find(v => v.id === body.variantId);

  if (!variant) return NextResponse.json({ ok: false, reason: 'variant not found' });

  // Incremental rolling average for duration
  const prevSessions = variant.sessions;
  variant.sessions += 1;
  if (body.durationSec && body.durationSec > 0) {
    variant.avgDurationSec = (variant.avgDurationSec * prevSessions + body.durationSec) / variant.sessions;
  }
  if (body.escalated) variant.escalations += 1;
  if (body.sentiment === 'positive') variant.positiveResponses += 1;

  test.markModified('variants');
  await test.save();

  return NextResponse.json({ ok: true });
}
