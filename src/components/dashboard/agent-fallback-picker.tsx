'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { ModelPickerCard } from '@/components/dashboard/model-picker-card';
import type { ClientModelOption } from '@/hooks/use-client-models';
import { mergeSavedModelOptions } from '@/hooks/use-client-models';

const inp: React.CSSProperties = {
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

export function AgentFallbackPicker({
  primaryModelId,
  fallbackModels,
  onChange,
  catalogModels,
  loading,
  catalogError,
  adminRestricted = true,
  planHasFallbacks = false,
  readOnly = false,
  accentColor = 'var(--primary)',
  maxCount = 3,
}: {
  primaryModelId: string;
  fallbackModels: string[];
  onChange: (ids: string[]) => void;
  catalogModels: ClientModelOption[];
  loading?: boolean;
  catalogError?: string | null;
  adminRestricted?: boolean;
  planHasFallbacks?: boolean;
  readOnly?: boolean;
  accentColor?: string;
  maxCount?: number;
}) {
  const [query, setQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(fallbackModels.length === 0);

  const displayModels = useMemo(
    () => mergeSavedModelOptions(catalogModels, ...fallbackModels),
    [catalogModels, fallbackModels],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return displayModels.filter((m) => {
      if (m.id === primaryModelId) return false;
      if (fallbackModels.includes(m.id)) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q)
        || m.id.toLowerCase().includes(q)
        || (m.category ?? '').toLowerCase().includes(q)
      );
    });
  }, [displayModels, primaryModelId, fallbackModels, query]);

  const canAdd = !readOnly && fallbackModels.length < maxCount && planHasFallbacks;

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>
            Modelo de respaldo (Hugging Face)
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
            Solo modelos <strong>hf/</strong> habilitados por el administrador para tu plan.
            Se usan si Vertex/Gemini falla o llega al límite.
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: `1px solid ${panelOpen ? accentColor : 'var(--border)'}`,
              background: panelOpen ? `rgba(var(--brand-primary-rgb),0.08)` : 'var(--background)',
              color: panelOpen ? accentColor : 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            <Plus size={13} />
            {fallbackModels.length === 0 ? 'Elegir respaldo' : 'Agregar otro'}
          </button>
        )}
      </div>

      {fallbackModels.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: panelOpen ? 12 : 0 }}>
          {fallbackModels.map((mid, idx) => {
            const info = displayModels.find((m) => m.id === mid);
            return (
              <div
                key={mid}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--muted)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#f59e0b' }}>Respaldo #{idx + 1}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Hugging Face</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                    {info?.name ?? mid}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 10, fontFamily: 'ui-monospace, monospace', color: 'var(--muted-foreground)', wordBreak: 'break-all' }}>
                    {mid}
                  </p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onChange(fallbackModels.filter((x) => x !== mid))}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 4, flexShrink: 0 }}
                    title="Quitar respaldo"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {fallbackModels.length === 0 && !readOnly && !loading && !planHasFallbacks && (
        <div
          style={{
            marginBottom: panelOpen ? 12 : 0,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px dashed var(--border)',
            background: 'rgba(245,158,11,0.06)',
            fontSize: 12,
            color: 'var(--muted-foreground)',
          }}
        >
          Tu plan no tiene modelos de respaldo habilitados. El administrador debe configurarlos en{' '}
          <strong>Admin → Asistente AI → Respaldo HuggingFace</strong>.
        </div>
      )}

      {fallbackModels.length === 0 && !readOnly && !loading && planHasFallbacks && (
        <div
          style={{
            marginBottom: panelOpen ? 12 : 0,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px dashed var(--border)',
            background: 'var(--background)',
            fontSize: 12,
            color: 'var(--muted-foreground)',
          }}
        >
          Sin respaldo configurado. Pulsa <strong>Elegir respaldo</strong> para añadir un modelo Hugging Face.
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted-foreground)', padding: '8px 0' }}>
          <Loader2 size={14} className="animate-spin" /> Cargando catálogo Hugging Face…
        </div>
      )}

      {catalogError && (
        <p style={{ fontSize: 12, color: '#d97706', margin: '0 0 10px' }}>{catalogError}</p>
      )}

      {panelOpen && canAdd && !loading && displayModels.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--muted)' }}>
          <input
            className="landing-input"
            style={{ ...inp, marginBottom: 10 }}
            placeholder="Buscar en Hugging Face…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {filtered.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
              <p style={{ margin: '0 0 8px' }}>Ningún modelo coincide con la búsqueda.</p>
              <button
                type="button"
                onClick={() => setQuery('')}
                style={{
                  padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: '1px solid var(--border)', background: 'var(--background)',
                  color: 'var(--foreground)', cursor: 'pointer',
                }}
              >
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 max-h-[280px] overflow-y-auto">
              {filtered.map((m) => (
                <ModelPickerCard
                  key={`fb-pick-${m.id}`}
                  model={m}
                  selected={false}
                  compact
                  showTier={false}
                  accentColor="#f59e0b"
                  selectionBadge="Respaldo"
                  onSelect={() => {
                    if (fallbackModels.length >= maxCount) return;
                    onChange([...fallbackModels, m.id]);
                    setQuery('');
                    if (fallbackModels.length + 1 >= maxCount) setPanelOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
