/**
 * GET /api/admin/ai-config/models?provider=vertex
 *
 * Devuelve los modelos disponibles para un provider específico,
 * leyendo el catálogo de AIBackHub (/api/models/available).
 * Solo accesible por admins.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';

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

export interface AiModelOption {
  modelId: string;
  name: string;
  provider: string;
  providerLabel: string;
  category: string;
  enabled: boolean;
  deprecated: boolean;
  badge?: string;
  maxTokens?: number;
  description?: string;
  replacementModelId?: string;
}

/** Normaliza el modelId de vertex para el landing: "gemini-2.5-flash" → "vx/gemini-2.5-flash" */
function normalizeModelId(modelId: string, provider: string): string {
  if (provider === 'vertex' && !modelId.startsWith('vx/')) return `vx/${modelId}`;
  return modelId;
}

/** Mapeo de provider key del hub → label legible */
const PROVIDER_LABELS: Record<string, string> = {
  vertex: 'Vertex AI (Gemini)',
  'google-ai': 'Google AI (Gemini)',
  anthropic: 'Anthropic (Claude)',
  deepseek: 'DeepSeek',
  huggingface: 'HuggingFace',
};

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filterProvider = searchParams.get('provider')?.trim();

  const baseUrl = getAibackhubBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: 'Backend no configurado.' }, { status: 503 });
  }

  type HubModelEntry = {
    modelId: string;
    name: string;
    provider: string;
    providerLabel?: string;
    category?: string;
    enabled?: boolean;
    deprecated?: boolean;
    badge?: string;
    maxTokens?: number;
    description?: string;
    replacementModelId?: string;
  };
  type HubData = { groups?: Record<string, HubModelEntry[]>; enabledProviders?: string[] };

  let hubData: HubData = {};

  try {
    const resp = await fetch(`${baseUrl}/api/models/available`, {
      headers: hubCreateHeaders(),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      return NextResponse.json({ error: 'Error al obtener modelos del hub.' }, { status: 502 });
    }

    const json = await resp.json() as { success?: boolean; data?: HubData };
    hubData = (json?.data ?? json) as HubData;
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar al hub.' }, { status: 503 });
  }

  // Aplanar grupos en lista de modelos
  const allModels: AiModelOption[] = [];
  const groups = hubData.groups ?? {};

  for (const [, models] of Object.entries(groups)) {
    for (const m of models) {
      allModels.push({
        modelId: normalizeModelId(m.modelId, m.provider),
        name: m.name ?? m.modelId,
        provider: m.provider,
        providerLabel: m.providerLabel ?? PROVIDER_LABELS[m.provider] ?? m.provider,
        category: m.category ?? 'chat',
        enabled: m.enabled !== false,
        deprecated: m.deprecated === true,
        badge: m.badge,
        maxTokens: m.maxTokens,
        description: m.description,
        replacementModelId: m.replacementModelId,
      });
    }
  }

  // Filtrar por provider si se solicitó
  const filtered = filterProvider
    ? allModels.filter(m => m.provider === filterProvider)
    : allModels;

  // Ordenar: habilitados primero, deprecated al final, luego por nombre
  filtered.sort((a, b) => {
    if (a.deprecated !== b.deprecated) return a.deprecated ? 1 : -1;
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const enabledProviders = hubData.enabledProviders ?? [];

  return NextResponse.json({
    success: true,
    data: {
      models: filtered,
      enabledProviders,
      totalModels: filtered.length,
    },
  });
}
