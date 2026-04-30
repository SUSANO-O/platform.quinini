import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';

const KNOWN_PROVIDERS = ['google', 'vertex', 'huggingface', 'openai', 'anthropic', 'deepseek'] as const;

export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

type CatalogModel = {
  modelId: string;
  provider: string;
};

function normalizeModelId(input: string): string {
  const id = input.trim();
  if (id.startsWith('hf/')) return id.slice(3);
  if (id.startsWith('vx/')) return id.slice(3);
  return id;
}

function sanitizeProviders(raw: unknown): KnownProvider[] {
  if (!Array.isArray(raw)) return [];
  const cleaned = raw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().toLowerCase())
    .filter((x): x is KnownProvider => (KNOWN_PROVIDERS as readonly string[]).includes(x));
  return [...new Set(cleaned)];
}

export async function getUserAllowedProviders(userId: string): Promise<KnownProvider[]> {
  await connectDB();
  const user = await User.findById(userId).select({ allowedModelProviders: 1 }).lean() as
    | { allowedModelProviders?: unknown }
    | null;
  return sanitizeProviders(user?.allowedModelProviders);
}

async function fetchEnabledCatalogModels(): Promise<CatalogModel[]> {
  const base = getAibackhubBaseUrl();
  if (!base) return [];
  const res = await fetch(`${base}/api/models/catalog/enabled`, {
    method: 'GET',
    headers: hubCreateHeaders(),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as {
    data?: { models?: Array<{ modelId?: string; provider?: string }> };
    models?: Array<{ modelId?: string; provider?: string }>;
  };
  const list = json?.data?.models ?? json?.models ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => typeof m?.modelId === 'string' && typeof m?.provider === 'string')
    .map((m) => ({ modelId: String(m.modelId), provider: String(m.provider).toLowerCase() }));
}

export async function resolveProviderForModelId(modelId: string): Promise<string | null> {
  const normalized = normalizeModelId(modelId);
  const rows = await fetchEnabledCatalogModels();
  const direct = rows.find((r) => r.modelId === modelId || r.modelId === normalized);
  if (direct?.provider) return direct.provider;
  return null;
}

export function isProviderAllowed(allowed: string[], provider: string): boolean {
  if (!allowed.length) return true;
  return allowed.includes(provider.toLowerCase());
}

export function normalizeAllowedProviders(raw: unknown): KnownProvider[] {
  return sanitizeProviders(raw);
}

