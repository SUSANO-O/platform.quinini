/**
 * Política de modelos por plan — evita pérdidas por modelos premium en planes bajos.
 * Los tiers por plan son editables desde /admin/ai-config y se guardan en platform_config.
 */

import { planMeetsModelMin } from '@/lib/agent-plans';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';
import { connectDB } from '@/lib/db/connection';
import mongoose from 'mongoose';

// 'lite' < 'flash' < 'default' < 'premium'
export type ModelTier = 'lite' | 'flash' | 'default' | 'premium';

export const TIER_RANK: Record<ModelTier, number> = {
  lite:    0,
  flash:   1,
  default: 2,
  premium: 3,
};

export const TIER_LABELS: Record<ModelTier, string> = {
  lite:    'Flash Lite (más económico)',
  flash:   'Flash (estándar)',
  default: 'Estándar / Pro-Light',
  premium: 'Pro / Premium (todos)',
};

/** Defaults hardcoded basados en análisis de costos Vertex AI (may 2026). */
export const PLAN_MAX_MODEL_TIER_DEFAULT: Record<string, ModelTier> = {
  free:       'lite',
  solo:       'lite',
  basic:      'flash',
  team:       'flash',
  plus:       'default',
  starter:    'default',
  growth:     'premium',
  business:   'premium',
  enterprise: 'premium',
};

/** @deprecated use PLAN_MAX_MODEL_TIER_DEFAULT. Mantenido por compatibilidad. */
export const PLAN_MAX_MODEL_TIER = PLAN_MAX_MODEL_TIER_DEFAULT;

// ── DB cache (TTL 60s) ────────────────────────────────────────────────────────
let tierCache: { at: number; tiers: Record<string, ModelTier> } | null = null;

export async function getPlanModelTiers(): Promise<Record<string, ModelTier>> {
  const now = Date.now();
  if (tierCache && now - tierCache.at < 60_000) return tierCache.tiers;
  try {
    await connectDB();
    const col = mongoose.connection.db!.collection<{ key: string; tiers?: Record<string, string> }>('platform_config');
    const doc = await col.findOne({ key: 'plan_model_tiers' });
    if (doc?.tiers && typeof doc.tiers === 'object') {
      const merged: Record<string, ModelTier> = { ...PLAN_MAX_MODEL_TIER_DEFAULT };
      for (const [plan, tier] of Object.entries(doc.tiers)) {
        if (tier in TIER_RANK) merged[plan] = tier as ModelTier;
      }
      tierCache = { at: now, tiers: merged };
      return merged;
    }
  } catch { /* fail-open */ }
  tierCache = { at: now, tiers: { ...PLAN_MAX_MODEL_TIER_DEFAULT } };
  return tierCache.tiers;
}

export function invalidateTierCache() {
  tierCache = null;
}

export function classifyModelTier(modelId: string): ModelTier {
  const m = modelId.toLowerCase();
  if (
    m.includes('pro') ||
    m.includes('ultra') ||
    m.includes('claude') ||
    m.includes('gpt-4') ||
    m.includes('gpt-5') ||
    m.includes('sonnet') ||
    m.includes('opus') ||
    m.includes('72b') ||
    m.includes('70b')
  ) return 'premium';
  // lite antes de flash para que flash-lite no caiga en flash
  if (
    m.includes('lite') ||
    m.includes('mini') ||
    m.includes('nano') ||
    m.includes('small')
  ) return 'lite';
  if (
    m.includes('flash') ||
    m.includes('2.0-flash') ||
    m.includes('3-flash') ||
    m.includes('3.1-flash')
  ) return 'flash';
  return 'default';
}

async function maxTierForPlan(plan: string): Promise<ModelTier> {
  const tiers = await getPlanModelTiers();
  return tiers[plan] ?? 'lite';
}

type CatalogRow = { modelId: string; minPlan?: string };

let catalogCache: { at: number; rows: CatalogRow[] } | null = null;

async function fetchCatalogRows(): Promise<CatalogRow[]> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < 60_000) return catalogCache.rows;

  const base = getAibackhubBaseUrl();
  if (!base) return [];

  try {
    const res = await fetch(`${base}/api/models/catalog/enabled`, {
      headers: hubCreateHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { models?: CatalogRow[] };
      models?: CatalogRow[];
    };
    const rows = json?.data?.models ?? json?.models ?? [];
    catalogCache = { at: now, rows: Array.isArray(rows) ? rows : [] };
    return catalogCache.rows;
  } catch {
    return [];
  }
}

function normalizeModelId(modelId: string): string {
  const id = modelId.trim();
  if (id.startsWith('hf/')) return id.slice(3);
  if (id.startsWith('vx/')) return id.slice(3);
  return id;
}

async function catalogMinPlanForModel(modelId: string): Promise<string | undefined> {
  const norm = normalizeModelId(modelId);
  const rows = await fetchCatalogRows();
  const hit = rows.find(
    (r) => r.modelId === modelId || r.modelId === norm || `hf/${r.modelId}` === modelId,
  );
  return hit?.minPlan;
}

export async function validateModelForPlan(
  userPlan: string,
  modelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = userPlan || 'free';
  const tier = classifyModelTier(modelId);
  const maxTier = await maxTierForPlan(plan);

  if (TIER_RANK[tier] > TIER_RANK[maxTier]) {
    const label = TIER_LABELS[maxTier];
    return {
      ok: false,
      error: `El modelo seleccionado no está disponible en el plan ${plan}. Máximo permitido: ${label}. Elige un modelo más económico o mejora tu plan.`,
    };
  }

  const minPlan = await catalogMinPlanForModel(modelId);
  if (minPlan && !planMeetsModelMin(plan, minPlan)) {
    return {
      ok: false,
      error: `Este modelo requiere plan ${minPlan} o superior. Tu plan actual es ${plan}.`,
    };
  }

  return { ok: true };
}
