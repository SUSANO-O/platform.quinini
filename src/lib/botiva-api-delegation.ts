/**
 * Delegación de claves afapi_ para Math-ais → API REST (misma base Mongo que la landing).
 */
import { createHash, randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { Subscription, User } from '@/lib/db/models';
import { canUseApiAccess } from '@/lib/plan-catalog';
import { resolveAgentflowApiUrl } from '@/lib/agentflow-api-url';

const DELEGATION_LABEL = 'math-ais-delegation';
const DELEGATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const AssistApiDelegationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    apiKey: { type: String, required: true },
    keyId: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'assist_api_delegations' },
);

const AssistApiDelegation =
  mongoose.models.AssistApiDelegation ||
  mongoose.model('AssistApiDelegation', AssistApiDelegationSchema);

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function generateRawApiKey(): string {
  return `afapi_${randomBytes(32).toString('hex')}`;
}

async function resolveUserPlan(userId: string): Promise<{
  plan: string;
  status: string;
  features?: string[] | null;
}> {
  const sub = (await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1, features: 1 })
    .lean()) as { plan?: string; status?: string; features?: string[] } | null;
  return {
    plan: String(sub?.plan || 'free'),
    status: String(sub?.status || 'none'),
    features: sub?.features,
  };
}

async function createApiKeyInMongo(userId: string, plan: string): Promise<{ rawKey: string; keyId: string }> {
  const rawKey = generateRawApiKey();
  const hashedKey = hashApiKey(rawKey);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB no conectado.');

  const doc = {
    userId,
    hashedKey,
    label: DELEGATION_LABEL,
    plan,
    scopes: [
      'agents:read',
      'agents:write',
      'widgets:read',
      'widgets:write',
      'conversations:read',
      'keys:read',
      'keys:write',
    ],
    revokedAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const res = await db.collection('apikeys').insertOne(doc);
  return { rawKey, keyId: String(res.insertedId) };
}

export async function ensureDelegatedApiKey(userId: string): Promise<string> {
  if (!userId || !/^[a-f0-9]{24}$/i.test(userId)) {
    throw new Error('userId inválido.');
  }
  await connectDB();

  const user = await User.findById(userId).select({ _id: 1 }).lean();
  if (!user) throw new Error('Usuario no encontrado.');

  const { plan, status, features } = await resolveUserPlan(userId);
  if (!canUseApiAccess(plan, status, features)) {
    throw new Error('El plan actual no incluye acceso a la API REST (Team+ o API Develop).');
  }

  const now = Date.now();
  const existing = (await AssistApiDelegation.findOne({ userId }).lean()) as {
    apiKey?: string;
    expiresAt?: Date;
  } | null;

  if (existing?.apiKey && existing.expiresAt && new Date(existing.expiresAt).getTime() > now) {
    return String(existing.apiKey);
  }

  const { rawKey, keyId } = await createApiKeyInMongo(userId, plan);
  const expiresAt = new Date(now + DELEGATION_TTL_MS);

  await AssistApiDelegation.findOneAndUpdate(
    { userId },
    { apiKey: rawKey, keyId, expiresAt },
    { upsert: true, new: true },
  );

  return rawKey;
}

export type BotivaApiProxyResult = {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
  hasApiAccess?: boolean;
};

export async function proxyBotivaApiRequest(params: {
  userId: string;
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}): Promise<BotivaApiProxyResult> {
  const method = params.method.toUpperCase();
  const path = params.path.trim();

  if (!path.startsWith('/api/v1/') && path !== '/api/v1/health' && !path.endsWith('/health')) {
    return { ok: false, status: 400, error: 'Solo rutas /api/v1/* permitidas.' };
  }

  const { plan, status, features } = await resolveUserPlan(params.userId);
  const hasApiAccess = canUseApiAccess(plan, status, features);
  if (!hasApiAccess) {
    return {
      ok: false,
      status: 403,
      error: 'Plan sin acceso API REST.',
      hasApiAccess: false,
    };
  }

  const apiBase = resolveAgentflowApiUrl();
  const apiKey = await ensureDelegatedApiKey(params.userId);

  const url = new URL(path.startsWith('/') ? path : `/${path}`, `${apiBase.replace(/\/$/, '')}/`);
  if (params.query) {
    for (const [k, v] of Object.entries(params.query)) {
      if (k && v != null) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const isHealth = path.includes('/health');
  if (!isHealth) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let bodyStr: string | undefined;
  if (method !== 'GET' && method !== 'DELETE' && params.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(params.body);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 502,
      error: `No se pudo contactar la API REST (${apiBase}): ${msg}`,
      hasApiAccess: true,
    };
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 8000) };
  }

  const envelope =
    typeof data === 'object' && data && 'ok' in data
      ? (data as { ok?: boolean; data?: unknown; error?: string })
      : { ok: res.ok, data };

  return {
    ok: res.ok && envelope.ok !== false,
    status: res.status,
    data: envelope.data ?? data,
    error: typeof envelope.error === 'string' ? envelope.error : !res.ok ? text.slice(0, 400) : undefined,
    hasApiAccess: true,
  };
}

export async function checkBotivaApiHealth(): Promise<{
  ok: boolean;
  apiBaseUrl: string;
  message: string;
}> {
  const apiBase = resolveAgentflowApiUrl();
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/v1/health`, {
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    const ok = res.ok && data.ok !== false;
    return {
      ok,
      apiBaseUrl: apiBase,
      message: ok ? 'API REST operativa.' : `API respondió ${res.status}.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      apiBaseUrl: apiBase,
      message: `API no alcanzable: ${msg}`,
    };
  }
}
