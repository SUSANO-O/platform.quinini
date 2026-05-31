'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ModelPickerCard } from '@/components/dashboard/model-picker-card';
import type { ClientModelOption } from '@/hooks/use-client-models';

const MODEL_CATS: { id: string; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'multimodal', label: 'Multimodal' },
  { id: 'chat', label: 'Chat' },
  { id: 'vision', label: 'Visión' },
  { id: 'audio', label: 'Audio' },
  { id: 'tts', label: 'TTS' },
  { id: 'image', label: 'Imagen' },
];

const MODEL_TIERS: { id: string; label: string; color: string }[] = [
  { id: 'all', label: 'Todos', color: 'var(--foreground)' },
  { id: 'stable', label: 'Stable', color: '#16a34a' },
  { id: 'pro', label: 'Pro', color: '#7c3aed' },
  { id: 'flash', label: 'Flash', color: '#0284c7' },
  { id: 'lite', label: 'Lite', color: '#d97706' },
  { id: 'preview', label: 'Preview', color: '#6366f1' },
];

const TIER_COLOR: Record<string, string> = {
  stable: '#16a34a',
  pro: '#7c3aed',
  flash: '#0284c7',
  lite: '#d97706',
  preview: '#6366f1',
};

function matchesSearch(m: ClientModelOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    m.name.toLowerCase().includes(q)
    || m.id.toLowerCase().includes(q)
    || (m.category ?? '').toLowerCase().includes(q)
  );
}

function matchesCat(m: ClientModelOption, catFilter: string): boolean {
  return catFilter === 'all' || (m.category ?? 'chat') === catFilter;
}

function matchesTier(m: ClientModelOption, tierFilter: string): boolean {
  return tierFilter === 'all' || (m.tier ?? 'stable') === tierFilter;
}

export function ModelCatalogPicker({
  models,
  selectedId,
  onSelect,
  accentColor = 'var(--primary)',
  disabled = false,
  showTier = true,
  searchPlaceholder = 'Buscar por nombre, capacidad o ID...',
  inputStyle,
}: {
  models: ClientModelOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  accentColor?: string;
  disabled?: boolean;
  showTier?: boolean;
  searchPlaceholder?: string;
  inputStyle?: CSSProperties;
}) {
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);

  const searchPool = useMemo(
    () => models.filter((m) => matchesSearch(m, query)),
    [models, query],
  );

  const poolForCatOptions = useMemo(
    () => searchPool.filter((m) => matchesTier(m, tierFilter)),
    [searchPool, tierFilter],
  );

  const poolForTierOptions = useMemo(
    () => searchPool.filter((m) => matchesCat(m, catFilter)),
    [searchPool, catFilter],
  );

  const visibleCats = useMemo(
    () => MODEL_CATS.filter(
      (c) => c.id === 'all' || poolForCatOptions.some((m) => (m.category ?? 'chat') === c.id),
    ),
    [poolForCatOptions],
  );

  const visibleTiers = useMemo(
    () => MODEL_TIERS.filter(
      (t) => t.id === 'all' || poolForTierOptions.some((m) => (m.tier ?? 'stable') === t.id),
    ),
    [poolForTierOptions],
  );

  const filtered = useMemo(
    () => searchPool.filter((m) => matchesCat(m, catFilter) && matchesTier(m, tierFilter)),
    [searchPool, catFilter, tierFilter],
  );

  useEffect(() => {
    if (catFilter !== 'all' && !visibleCats.some((c) => c.id === catFilter)) {
      setCatFilter('all');
    }
  }, [visibleCats, catFilter]);

  useEffect(() => {
    if (tierFilter !== 'all' && !visibleTiers.some((t) => t.id === tierFilter)) {
      setTierFilter('all');
    }
  }, [visibleTiers, tierFilter]);

  const ordered = useMemo(() => {
    const idx = filtered.findIndex((m) => m.id === selectedId);
    if (idx <= 0) return filtered;
    return [filtered[idx], ...filtered.slice(0, idx), ...filtered.slice(idx + 1)];
  }, [filtered, selectedId]);

  const visible = showAll ? ordered : ordered.slice(0, 12);
  const hasActiveFilters = query.trim().length > 0 || catFilter !== 'all' || tierFilter !== 'all';
  const showCatRow = visibleCats.length > 2;
  const showTierRow = showTier && visibleTiers.length > 2;

  const inp: CSSProperties = inputStyle ?? {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const clearFilters = () => {
    setQuery('');
    setCatFilter('all');
    setTierFilter('all');
    setShowAll(false);
  };

  if (models.length === 0) {
    return (
      <div
        style={{
          padding: '16px 14px',
          borderRadius: 12,
          border: '1px dashed var(--border)',
          fontSize: 12,
          color: 'var(--muted-foreground)',
          lineHeight: 1.5,
        }}
      >
        No hay modelos disponibles para tu plan en este momento.
      </div>
    );
  }

  return (
    <>
      <div style={{ border: '1px solid var(--border)', background: 'var(--muted)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
        <input
          className="landing-input"
          style={inp}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowAll(false); }}
          placeholder={searchPlaceholder}
          disabled={disabled}
        />
      </div>

      {showCatRow && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: showTierRow ? 8 : 10 }}>
          {visibleCats.map((c) => {
            const active = catFilter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  border: `1px solid ${active ? accentColor : 'var(--border)'}`,
                  background: active ? `rgba(var(--brand-primary-rgb),0.08)` : 'var(--background)',
                  color: active ? accentColor : 'var(--muted-foreground)',
                  opacity: disabled ? 0.6 : 1,
                }}
                onClick={() => { setCatFilter(c.id); setShowAll(false); }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {showTierRow && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {visibleTiers.map((t) => {
            const active = tierFilter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                style={{
                  padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  border: `1px solid ${active ? t.color : 'var(--border)'}`,
                  background: active ? `${t.color}18` : 'var(--background)',
                  color: active ? t.color : 'var(--muted-foreground)',
                  opacity: disabled ? 0.6 : 1,
                }}
                onClick={() => { setTierFilter(t.id); setShowAll(false); }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        hasActiveFilters && (
          <div
            style={{
              marginBottom: 12,
              padding: '14px 16px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--muted)',
              fontSize: 12,
              color: 'var(--muted-foreground)',
              lineHeight: 1.5,
            }}
          >
            <p style={{ margin: '0 0 10px' }}>
              Ningún modelo coincide con la búsqueda o los filtros activos.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              disabled={disabled}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: '1px solid var(--border)', background: 'var(--background)',
                color: 'var(--foreground)', cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              Limpiar búsqueda y filtros
            </button>
          </div>
        )
      ) : (
        <>
          {hasActiveFilters && (
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 0 8px' }}>
              {filtered.length} modelo{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
            </p>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
            {visible.map((m) => (
              <ModelPickerCard
                key={m.id}
                model={m}
                selected={selectedId === m.id}
                onSelect={() => onSelect(m.id)}
                disabled={disabled}
                accentColor={accentColor}
                showTier={showTier}
                tierColor={TIER_COLOR[m.tier ?? 'stable'] ?? 'var(--muted-foreground)'}
                selectionBadge="Principal"
              />
            ))}
          </div>

          {filtered.length > 12 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              disabled={disabled}
              style={{
                marginTop: 10, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: '1px solid var(--border)', background: 'var(--background)',
                color: 'var(--foreground)', cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {showAll ? 'Ver menos' : `Ver todos (${filtered.length})`}
            </button>
          )}
        </>
      )}
    </>
  );
}
