/**
 * GET  /api/admin/plan-model-tiers  — tiers actuales (defaults + overrides de DB)
 * PUT  /api/admin/plan-model-tiers  — guarda overrides en platform_config
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import {
  PLAN_MAX_MODEL_TIER_DEFAULT,
  TIER_RANK,
  type ModelTier,
  getPlanModelTiers,
  invalidateTierCache,
} from '@/lib/model-plan-policy';

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  await connectDB();
  const user = await User.findById(userId).lean() as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return userId;
}

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const tiers = await getPlanModelTiers();
  return NextResponse.json({
    tiers,
    defaults: PLAN_MAX_MODEL_TIER_DEFAULT,
    availableTiers: Object.keys(TIER_RANK),
  });
}

export async function PUT(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.tiers !== 'object' || !body.tiers) {
    return NextResponse.json({ error: 'Se requiere { tiers: { plan: tier } }' }, { status: 400 });
  }

  const input = body.tiers as Record<string, unknown>;
  const validated: Record<string, ModelTier> = {};
  for (const [plan, tier] of Object.entries(input)) {
    if (typeof tier === 'string' && tier in TIER_RANK) {
      validated[plan] = tier as ModelTier;
    }
  }

  await connectDB();
  const col = mongoose.connection.db!.collection<{ key: string }>('platform_config');
  await col.updateOne(
    { key: 'plan_model_tiers' },
    { $set: { key: 'plan_model_tiers', tiers: validated, updatedAt: new Date().toISOString(), updatedBy: adminId } },
    { upsert: true },
  );

  invalidateTierCache();
  const merged = await getPlanModelTiers();
  return NextResponse.json({ tiers: merged });
}
