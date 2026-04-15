'use client';

import { useEffect, useState } from 'react';
import { planMeetsModelMin } from '@/lib/agent-plans';

export type ClientModelOption = {
  id: string;
  name: string;
  provider: string;
  badge?: string;
  description?: string;
  maxTokens?: number;
  minPlan?: string;
  deprecated?: boolean;
};

type CatalogDoc = {
  modelId: string;
  provider: string;
  providerLabel?: string;
  name: string;
  category?: string;
  maxTokens?: number;
  description?: string;
  badge?: string;
  minPlan?: string;
  deprecated?: boolean;
};

function publicModelId(m: Pick<CatalogDoc, 'modelId' | 'provider'>): string {
  if (m.provider === 'huggingface' && !m.modelId.startsWith('hf/')) {
    return `hf/${m.modelId}`;
  }
  if (m.provider === 'vertex' && !m.modelId.startsWith('vx/')) {
    return `vx/${m.modelId}`;
  }
  return m.modelId;
}

/**
 * Modelos para formularios de agentes: GET /api/models/catalog/for-agent-hub (AIBackHub).
 * Respeta `offerForNewAgents` y `enabled`. Filtra por plan (`minPlan`).
 * Lista vacía hasta recibir datos (no hay lista embebida con Gemini: evita mostrar modelos deshabilitados).
 */
export function useClientModels(userPlan?: string) {
  const [models, setModels] = useState<ClientModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [hubError, setHubError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHubError(null);
    fetch('/api/models/catalog/for-agent-hub')
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          const msg =
            typeof j?.error === 'string'
              ? j.error
              : `No se pudo cargar el catálogo (${r.status}).`;
          if (!cancelled) {
            setHubError(msg);
            setModels([]);
          }
          return null;
        }
        return r.json() as Promise<{
          success?: boolean;
          data?: { models?: CatalogDoc[] };
          models?: CatalogDoc[];
        }>;
      })
      .then((body) => {
        if (cancelled) return;
        if (!body) return;

        const data = body?.data ?? body;
        const raw = data?.models;
        if (!Array.isArray(raw) || raw.length === 0) {
          setModels([]);
          setHubError('El catálogo llegó vacío. Revisa AIBackHub y BACKEND_URL.');
          return;
        }

        const flat: ClientModelOption[] = [];
        const plan = userPlan ?? 'free';
        for (const m of raw) {
          if (!planMeetsModelMin(plan, m.minPlan)) continue;
          flat.push({
            id: publicModelId(m),
            name: m.name,
            provider: m.providerLabel || m.provider,
            badge: m.badge,
            description: m.description,
            maxTokens: m.maxTokens,
            minPlan: m.minPlan,
            deprecated: m.deprecated,
          });
        }
        setModels(flat);
        setHubError(flat.length === 0 ? 'Ningún modelo disponible para tu plan o catálogo.' : null);
      })
      .catch((e) => {
        if (!cancelled) {
          setModels([]);
          setHubError(
            e instanceof Error ? e.message : 'Error de red al cargar modelos.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userPlan]);

  return { models, loading, hubError };
}

/** Incluye IDs guardados que ya no están en el catálogo (agentes antiguos). */
export function mergeSavedModelOptions(
  models: ClientModelOption[],
  ...ids: (string | undefined)[]
): ClientModelOption[] {
  let out = [...models];
  for (const raw of ids) {
    const id = (raw ?? '').trim();
    if (!id || out.some((m) => m.id === id)) continue;
    out = [{ id, name: id, provider: 'Modelo guardado', badge: 'actual' }, ...out];
  }
  return out;
}
