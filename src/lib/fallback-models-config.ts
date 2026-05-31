/**
 * Modelos de respaldo de agentes — solo HuggingFace, lista explícita en admin (por plan o global).
 */

import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';
import { PLAN_ORDER } from '@/lib/plan-catalog';

export const FALLBACK_CONFIG_KEY = 'agent_fallback_models';

export type FallbackScopeMode = 'all' | 'per_plan';

export type FallbackModelsConfig = {
  /** all = misma lista para todos los planes; per_plan = lista distinta por plan */
  mode: FallbackScopeMode;
  /** Modelos hf/… cuando mode === 'all' */
  allPlans: string[];
  /** planId → modelIds hf/… cuando mode === 'per_plan' */
  byPlan: Record<string, string[]>;
  updatedAt?: string;
  updatedBy?: string;
};

export type HubFallbackModel = {
  modelId: string;
  name: string;
  provider: string;
  providerLabel: string;
  category?: string;
  description?: string;
  badge?: string;
  maxTokens?: number;
  deprecated?: boolean;
};

const DEFAULT_CONFIG: FallbackModelsConfig = {
  mode: 'all',
  allPlans: [],
  byPlan: {},
};

function platformConfigCol() {
  return mongoose.connection.db!.collection<{ key: string } & Record<string, unknown>>('platform_config');
}

function cleanModelIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(
    ids
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim()),
  )];
}

function cleanByPlan(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [plan, ids] of Object.entries(raw as Record<string, unknown>)) {
    const key = plan.trim().toLowerCase();
    if (!key) continue;
    const cleaned = cleanModelIds(ids);
    if (cleaned.length > 0) out[key] = cleaned;
  }
  return out;
}

function normalizeConfig(doc: Record<string, unknown> | null): FallbackModelsConfig {
  if (!doc) return { ...DEFAULT_CONFIG };

  if (doc.mode === 'all' || doc.mode === 'per_plan') {
    return {
      mode: doc.mode,
      allPlans: cleanModelIds(doc.allPlans),
      byPlan: cleanByPlan(doc.byPlan),
      updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : undefined,
      updatedBy: typeof doc.updatedBy === 'string' ? doc.updatedBy : undefined,
    };
  }

  // Migración desde schema anterior (modelIds plano)
  if (Array.isArray(doc.modelIds)) {
    return {
      mode: 'all',
      allPlans: cleanModelIds(doc.modelIds),
      byPlan: {},
      updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : undefined,
      updatedBy: typeof doc.updatedBy === 'string' ? doc.updatedBy : undefined,
    };
  }

  return { ...DEFAULT_CONFIG };
}

export function isHuggingFaceModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  return id.startsWith('hf/') || id.includes('huggingface');
}

export function normalizePublicModelId(modelId: string, provider?: string): string {
  const id = modelId.trim();
  if (id.startsWith('hf/') || id.startsWith('vx/')) return id;
  if (provider === 'huggingface') return `hf/${id}`;
  return id;
}

export function getAllowedModelIdsForPlan(config: FallbackModelsConfig, plan: string): string[] {
  const planId = (plan || 'free').trim().toLowerCase();
  if (config.mode === 'per_plan') {
    return config.byPlan[planId] ?? [];
  }
  return config.allPlans;
}

export async function getFallbackModelsConfig(): Promise<FallbackModelsConfig> {
  await connectDB();
  const doc = await platformConfigCol().findOne({ key: FALLBACK_CONFIG_KEY });
  return normalizeConfig(doc as Record<string, unknown> | null);
}

export async function saveFallbackModelsConfig(
  input: Pick<FallbackModelsConfig, 'mode' | 'allPlans' | 'byPlan'>,
  updatedBy: string,
): Promise<FallbackModelsConfig> {
  await connectDB();
  const mode: FallbackScopeMode = input.mode === 'per_plan' ? 'per_plan' : 'all';
  const allPlans = cleanModelIds(input.allPlans);
  const byPlan = cleanByPlan(input.byPlan);

  if (mode === 'per_plan') {
    for (const planId of Object.keys(byPlan)) {
      if (!(PLAN_ORDER as readonly string[]).includes(planId)) {
        throw new Error(`Plan desconocido: "${planId}".`);
      }
    }
  }

  const now = new Date().toISOString();
  const payload: FallbackModelsConfig = {
    mode,
    allPlans: mode === 'all' ? allPlans : [],
    byPlan: mode === 'per_plan' ? byPlan : {},
    updatedAt: now,
    updatedBy,
  };

  await platformConfigCol().updateOne(
    { key: FALLBACK_CONFIG_KEY },
    {
      $set: { key: FALLBACK_CONFIG_KEY, ...payload },
      $unset: { modelIds: '' },
    },
    { upsert: true },
  );

  return payload;
}

type CatalogDoc = {
  modelId: string;
  provider: string;
  providerLabel?: string;
  name: string;
  category?: string;
  description?: string;
  badge?: string;
  maxTokens?: number;
  deprecated?: boolean;
};

/** Modelos HF desde catálogo for-agent-hub (enabled + offerForNewAgents). */
export async function fetchHubHuggingFaceModels(): Promise<HubFallbackModel[]> {
  const base = getAibackhubBaseUrl();
  if (!base) return [];

  try {
    const res = await fetch(`${base}/api/models/catalog/for-agent-hub`, {
      headers: hubCreateHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { models?: CatalogDoc[] };
      models?: CatalogDoc[];
    };
    const rows = json?.data?.models ?? json?.models ?? [];
    if (!Array.isArray(rows)) return [];

    return rows
      .filter((m) => m?.provider === 'huggingface' || String(m?.modelId ?? '').startsWith('hf/'))
      .map((m) => ({
        modelId: normalizePublicModelId(m.modelId, m.provider),
        name: m.name || m.modelId,
        provider: 'huggingface',
        providerLabel: m.providerLabel || 'Hugging Face',
        category: m.category,
        description: m.description,
        badge: m.badge,
        maxTokens: m.maxTokens,
        deprecated: m.deprecated === true,
      }))
      .filter((m) => !m.deprecated)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function stubModel(id: string, hubModels: HubFallbackModel[]): HubFallbackModel {
  const hit = hubModels.find((m) => m.modelId === id);
  return hit ?? {
    modelId: id,
    name: id.replace(/^hf\//, ''),
    provider: 'huggingface',
    providerLabel: 'Hugging Face',
  };
}

/** Catálogo HF visible para usuarios según plan (solo modelos habilitados por admin). */
export async function listFallbackModelsForAgents(
  extraIds: string[] = [],
  plan: string = 'free',
): Promise<HubFallbackModel[]> {
  const [config, hubModels] = await Promise.all([
    getFallbackModelsConfig(),
    fetchHubHuggingFaceModels(),
  ]);

  const allowedIds = getAllowedModelIdsForPlan(config, plan);
  const allowSet = new Set(allowedIds);

  const byId = new Map<string, HubFallbackModel>();
  for (const m of hubModels) {
    if (allowSet.has(m.modelId)) byId.set(m.modelId, m);
  }
  for (const id of allowedIds) {
    if (!byId.has(id)) byId.set(id, stubModel(id, hubModels));
  }
  for (const raw of extraIds) {
    const id = raw.trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, stubModel(id, hubModels));
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function validateAgentFallbackModels(
  modelIds: string[],
  plan: string = 'free',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleaned = modelIds
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, 3);

  if (cleaned.length === 0) return { ok: true };

  for (const id of cleaned) {
    if (!isHuggingFaceModelId(id)) {
      return {
        ok: false,
        error: 'Los modelos de respaldo solo pueden ser de Hugging Face (prefijo hf/). Vertex y Gemini son solo para el modelo principal.',
      };
    }
  }

  const config = await getFallbackModelsConfig();
  const allowed = getAllowedModelIdsForPlan(config, plan);

  if (allowed.length === 0) {
    return {
      ok: false,
      error: 'Tu plan no tiene modelos de respaldo habilitados. Contacta al administrador en Admin → Asistente AI → Respaldo HuggingFace.',
    };
  }

  const allowSet = new Set(allowed);
  const bad = cleaned.find((id) => !allowSet.has(id));
  if (bad) {
    return {
      ok: false,
      error: `El modelo de respaldo "${bad}" no está habilitado para tu plan. El administrador debe activarlo en Admin → Asistente AI → Respaldo HuggingFace.`,
    };
  }

  return { ok: true };
}
