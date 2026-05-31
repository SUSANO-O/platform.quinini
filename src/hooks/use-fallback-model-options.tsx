'use client';

import { useEffect, useState } from 'react';
import type { ClientModelOption } from '@/hooks/use-client-models';

function toClientOption(m: {
  modelId: string;
  name: string;
  provider: string;
  providerLabel?: string;
  category?: string;
  description?: string;
  badge?: string;
  maxTokens?: number;
}): ClientModelOption {
  return {
    id: m.modelId,
    name: m.name,
    provider: m.providerLabel || m.provider,
    badge: m.badge,
    category: m.category,
    description: m.description,
    maxTokens: m.maxTokens,
    tier: 'stable',
  };
}

/** Modelos HuggingFace habilitados como respaldo (config admin). */
export function useFallbackModelOptions(includeIds: string[] = []) {
  const [models, setModels] = useState<ClientModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminRestricted, setAdminRestricted] = useState(true);
  const [planHasFallbacks, setPlanHasFallbacks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const includeKey = includeIds.filter(Boolean).join(',');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qs = includeKey ? `?include=${encodeURIComponent(includeKey)}` : '';
    fetch(`/api/models/catalog/fallback${qs}`)
      .then(async (r) => {
        const json = (await r.json()) as {
          data?: {
            models?: Array<Parameters<typeof toClientOption>[0]>;
            adminRestricted?: boolean;
            planHasFallbacks?: boolean;
          };
          error?: string;
        };
        if (!r.ok) throw new Error(json.error || 'No se pudo cargar respaldos HF.');
        if (cancelled) return;
        const rows = json.data?.models ?? [];
        setModels(rows.map(toClientOption));
        setAdminRestricted(json.data?.adminRestricted === true);
        setPlanHasFallbacks(json.data?.planHasFallbacks === true);
      })
      .catch((e) => {
        if (!cancelled) {
          setModels([]);
          setPlanHasFallbacks(false);
          setError(e instanceof Error ? e.message : 'Error al cargar respaldos.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [includeKey]);

  return { models, loading, adminRestricted, planHasFallbacks, error };
}
