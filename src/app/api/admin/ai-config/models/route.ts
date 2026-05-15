/**
 * GET /api/admin/ai-config/models?provider=vertex
 *
 * Devuelve los modelos disponibles para un provider específico,
 * leyendo el catálogo de AIBackHub (/api/models/available).
 * Solo accesible por admins.
 *
 * El response de AIBackHub tiene la forma:
 *   { success: true, data: { groups: AvailableGroup[], enabledProviders: string[] } }
 * donde AvailableGroup = { provider, label, models: [{ id, name, ... }] }
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

type HubGroupModel = {
  id: string;
  name?: string;
  category?: string;
  maxTokens?: number;
  description?: string;
  badge?: string;
  deprecated?: boolean;
  replacementModelId?: string;
};

type HubGroup = {
  provider: string;
  label?: string;
  models?: HubGroupModel[];
};

type HubData = {
  groups?: HubGroup[];
  enabledProviders?: string[];
};

/**
 * La UI usa 'google-ai' pero el catálogo de AIBackHub usa 'google'.
 * Este mapa traduce el filtro de la UI al provider key real del catálogo.
 */
const UI_PROVIDER_TO_CATALOG: Record<string, string> = {
  'google-ai': 'google',
};

function toCatalogProvider(uiProvider: string): string {
  return UI_PROVIDER_TO_CATALOG[uiProvider] ?? uiProvider;
}

export async function GET(req: NextRequest) {
  try {
    const adminId = await requireAdmin(req);
    if (!adminId) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const uiProvider = searchParams.get('provider')?.trim() || undefined;
    const catalogProvider = uiProvider ? toCatalogProvider(uiProvider) : undefined;

    const baseUrl = getAibackhubBaseUrl();
    if (!baseUrl) {
      return NextResponse.json({ error: 'Backend no configurado (BACKEND_URL).' }, { status: 503 });
    }

    let hubData: HubData = {};

    try {
      const resp = await fetch(`${baseUrl}/api/models/available`, {
        headers: hubCreateHeaders(),
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        return NextResponse.json(
          { error: `El hub devolvió HTTP ${resp.status}.` },
          { status: 502 },
        );
      }

      const json = await resp.json() as { success?: boolean; data?: HubData } | HubData;
      const raw = (json as { data?: HubData }).data ?? (json as HubData);
      hubData = (raw && typeof raw === 'object') ? raw as HubData : {};
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      return NextResponse.json(
        { error: 'No se pudo conectar al hub.', detail: msg },
        { status: 503 },
      );
    }

    // groups es un array de { provider, label, models: [{id, name, ...}] }
    const groups = Array.isArray(hubData.groups) ? hubData.groups : [];
    const allModels: AiModelOption[] = [];

    for (const group of groups) {
      if (!group?.provider || !Array.isArray(group.models)) continue;

      // Filtrar por provider si se solicitó
      if (catalogProvider && group.provider !== catalogProvider) continue;

      for (const m of group.models) {
        if (!m?.id) continue;

        allModels.push({
          modelId:           m.id,   // ya incluye prefijo vx/ o hf/ según provider
          name:              m.name ?? m.id,
          provider:          group.provider,
          providerLabel:     group.label ?? group.provider,
          category:          m.category ?? 'chat',
          enabled:           true,   // /available solo devuelve modelos enabled
          deprecated:        m.deprecated === true,
          badge:             m.badge,
          maxTokens:         m.maxTokens,
          description:       m.description,
          replacementModelId: m.replacementModelId,
        });
      }
    }

    // Deprecated al final, luego alfabético
    allModels.sort((a, b) => {
      if (a.deprecated !== b.deprecated) return a.deprecated ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      success: true,
      data: {
        models:           allModels,
        enabledProviders: Array.isArray(hubData.enabledProviders) ? hubData.enabledProviders : [],
        totalModels:      allModels.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai-config/models] Unhandled error:', msg);
    return NextResponse.json({ error: 'Error interno del servidor.', detail: msg }, { status: 500 });
  }
}
