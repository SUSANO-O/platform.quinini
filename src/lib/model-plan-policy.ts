/**
 * Política de modelos por plan — evita pérdidas por modelos premium en planes bajos.
 */

import { planMeetsModelMin } from '@/lib/agent-plans';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';

export type ModelTier = 'flash' | 'default' | 'premium';

const TIER_RANK: Record<ModelTier, number> = {
  flash: 0,
  default: 1,
  premium: 2,
};

/** Tier máximo permitido por plan (techo de coste de inferencia). */
export const PLAN_MAX_MODEL_TIER: Record<string, ModelTier> = {
  free:       'flash',
  solo:       'flash',
  basic:      'flash',
  team:       'default',
  plus:       'default',
  starter:    'default',
  growth:     'premium',
  business:   'premium',
  enterprise: 'premium',
};

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
  if (
    m.includes('flash') ||
    m.includes('mini') ||
    m.includes('nano') ||
    m.includes('small') ||
    m.includes('lite') ||
    m.includes('2.0-flash')
  ) return 'flash';
  return 'default';
}

function maxTierForPlan(plan: string): ModelTier {
  return PLAN_MAX_MODEL_TIER[plan] ?? 'flash';
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
  const maxTier = maxTierForPlan(plan);

  if (TIER_RANK[tier] > TIER_RANK[maxTier]) {
    return {
      ok: false,
      error: `El modelo seleccionado requiere un plan superior. Tu plan ${plan} permite hasta modelos ${maxTier === 'flash' ? 'rápidos (Flash)' : maxTier === 'default' ? 'estándar' : 'premium'}. Mejora tu plan o elige Gemini Flash.`,
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
