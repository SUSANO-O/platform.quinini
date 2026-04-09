'use client';

import { useEffect, useState } from 'react';
import { CLIENT_MODELS, planMeetsModelMin } from '@/lib/agent-plans';

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

function staticFallback(): ClientModelOption[] {
  return CLIENT_MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    badge: m.badge,
  }));
}

type AvailableGroup = {
  provider?: string;
  label?: string;
  models?: Array<{
    id: string;
    name: string;
    badge?: string;
    description?: string;
    maxTokens?: number;
    minPlan?: string;
    deprecated?: boolean;
  }>;
};

/**
 * Modelos ofrecidos en formularios: GET /api/models/available (AIBackHub → Mongo).
 * Opcionalmente filtra por plan (`minPlan` del catálogo).
 * Si falla la red o el backend, usa CLIENT_MODELS como respaldo.
 */
export function useClientModels(userPlan?: string) {
  const [models, setModels] = useState<ClientModelOption[]>(staticFallback);
  const [loading, setLoading] = useState(true);
  const [hubError, setHubError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHubError(null);
    fetch('/api/models/available')
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          const msg =
            typeof j?.error === 'string'
              ? j.error
              : `No se pudo cargar el catálogo (${r.status}).`;
          if (!cancelled) setHubError(msg);
          return null;
        }
        return r.json() as Promise<{
          success?: boolean;
          data?: { groups?: AvailableGroup[] };
          groups?: AvailableGroup[];
        }>;
      })
      .then((body) => {
        if (cancelled || !body) return;
        const data = body?.data ?? body;
        const groups = data?.groups;
        if (!Array.isArray(groups) || groups.length === 0) {
          if (!cancelled) {
            setHubError('El catálogo llegó vacío. Revisa AIBackHub y BACKEND_URL.');
          }
          return;
        }

        const flat: ClientModelOption[] = [];
        const plan = userPlan ?? 'free';
        for (const g of groups) {
          const label = g.label || g.provider || '';
          for (const m of g.models || []) {
            if (!planMeetsModelMin(plan, m.minPlan)) continue;
            flat.push({
              id: m.id,
              name: m.name,
              provider: label,
              badge: m.badge,
              description: m.description,
              maxTokens: m.maxTokens,
              minPlan: m.minPlan,
              deprecated: m.deprecated,
            });
          }
        }
        if (flat.length > 0) {
          setModels(flat);
          setHubError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
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
