/**
 * GET  /api/admin/fallback-models — config + catálogo HF
 * PUT  /api/admin/fallback-models — { mode, allPlans?, byPlan? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import {
  fetchHubHuggingFaceModels,
  getFallbackModelsConfig,
  isHuggingFaceModelId,
  saveFallbackModelsConfig,
  type FallbackScopeMode,
} from '@/lib/fallback-models-config';

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  await connectDB();
  const user = (await User.findById(userId).lean()) as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return userId;
}

function collectAllModelIds(
  mode: FallbackScopeMode,
  allPlans: string[],
  byPlan: Record<string, string[]>,
): string[] {
  if (mode === 'per_plan') {
    return [...new Set(Object.values(byPlan).flat())];
  }
  return allPlans;
}

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const [config, catalog] = await Promise.all([
    getFallbackModelsConfig(),
    fetchHubHuggingFaceModels(),
  ]);

  const enabledCount =
    config.mode === 'per_plan'
      ? Object.values(config.byPlan).reduce((n, ids) => n + ids.length, 0)
      : config.allPlans.length;

  return NextResponse.json({
    success: true,
    data: {
      config,
      catalog,
      enabledCount,
      hint:
        config.mode === 'per_plan'
          ? 'Configura modelos de respaldo distintos por plan. Los planes sin modelos no tendrán respaldo disponible.'
          : 'Los modelos marcados aplican a todos los planes. Sin selección, ningún usuario podrá elegir respaldo.',
    },
  });
}

export async function PUT(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    mode?: unknown;
    allPlans?: unknown;
    byPlan?: unknown;
  } | null;

  if (!body || (body.mode !== 'all' && body.mode !== 'per_plan')) {
    return NextResponse.json({ error: 'mode debe ser "all" o "per_plan".' }, { status: 400 });
  }

  const mode = body.mode as FallbackScopeMode;
  const allPlans = Array.isArray(body.allPlans)
    ? body.allPlans.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
    : [];
  const byPlan: Record<string, string[]> = {};
  if (body.byPlan && typeof body.byPlan === 'object' && !Array.isArray(body.byPlan)) {
    for (const [plan, ids] of Object.entries(body.byPlan as Record<string, unknown>)) {
      if (!Array.isArray(ids)) continue;
      const cleaned = ids
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim());
      if (cleaned.length > 0) byPlan[plan.trim().toLowerCase()] = cleaned;
    }
  }

  const allIds = collectAllModelIds(mode, allPlans, byPlan);
  for (const id of allIds) {
    if (!isHuggingFaceModelId(id)) {
      return NextResponse.json(
        { error: `Solo modelos Hugging Face (hf/…): "${id}" no es válido.` },
        { status: 400 },
      );
    }
  }

  const catalog = await fetchHubHuggingFaceModels();
  const catalogIds = new Set(catalog.map((m) => m.modelId));
  const unknown = allIds.filter((id) => !catalogIds.has(id));
  if (unknown.length > 0 && catalog.length > 0) {
    return NextResponse.json(
      { error: `Modelos no encontrados en el catálogo HF: ${unknown.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const saved = await saveFallbackModelsConfig({ mode, allPlans, byPlan }, adminId);
    return NextResponse.json({ success: true, data: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error al guardar.' },
      { status: 400 },
    );
  }
}
