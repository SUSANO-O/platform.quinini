/**
 * GET /api/models/catalog/fallback — modelos HF permitidos como respaldo (según plan del usuario).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Subscription } from '@/lib/db/models';
import {
  getAllowedModelIdsForPlan,
  getFallbackModelsConfig,
  listFallbackModelsForAgents,
} from '@/lib/fallback-models-config';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  const userId = token ? verifySessionToken(token) : null;
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  await connectDB();
  const sub = (await Subscription.findOne({ userId }).lean()) as { plan?: string; status?: string } | null;
  const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';

  const extra = (req.nextUrl.searchParams.get('include') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const [models, config] = await Promise.all([
    listFallbackModelsForAgents(extra, plan),
    getFallbackModelsConfig(),
  ]);

  const allowedForPlan = getAllowedModelIdsForPlan(config, plan);

  return NextResponse.json({
    success: true,
    data: {
      models,
      provider: 'huggingface',
      total: models.length,
      plan,
      adminRestricted: true,
      planHasFallbacks: allowedForPlan.length > 0,
    },
  });
}
