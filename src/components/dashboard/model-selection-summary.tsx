'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ClientModelOption } from '@/hooks/use-client-models';

function resolveModel(id: string, models: ClientModelOption[]) {
  const hit = models.find((m) => m.id === id);
  return {
    id,
    name: hit?.name ?? id,
    unknown: !hit,
    deprecated: hit?.deprecated,
  };
}

interface FallbackCatalogEntry {
  id: string;
  name?: string;
}

export function ModelSelectionSummary({
  primaryId,
  fallbackIds,
  models,
  accentColor = 'var(--primary)',
  fallbackCatalog,
  onAddFallback,
  readOnly,
}: {
  primaryId: string;
  fallbackIds: string[];
  models: ClientModelOption[];
  accentColor?: string;
  fallbackCatalog?: FallbackCatalogEntry[];
  onAddFallback?: (modelId: string) => void;
  readOnly?: boolean;
}) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [query, setQuery] = useState('');

  const primary = primaryId.trim() ? resolveModel(primaryId, models) : null;
  const fallbacks = fallbackIds.map((id) => resolveModel(id, models));

  if (!primary) {
    return (
      <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 12, border: '1px dashed var(--border)', background: 'var(--muted)', fontSize: 12, color: 'var(--muted-foreground)' }}>
        Selecciona un modelo principal en la lista de abajo.
      </div>
    );
  }

  const hfOptions = (fallbackCatalog ?? []).filter(
    (m) => m.id.startsWith('hf/') && !fallbackIds.includes(m.id),
  );
  const filtered = query.trim()
    ? hfOptions.filter((m) => `${m.id} ${m.name ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    : hfOptions;

  const canAddFallback = !readOnly && onAddFallback && hfOptions.length > 0;

  return (
    <>
      <div style={{ marginBottom: 12, padding: '14px 16px', borderRadius: 12, border: `1px solid color-mix(in srgb, ${accentColor} 35%, var(--border))`, background: `color-mix(in srgb, ${accentColor} 6%, var(--card))` }}>
        <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
          Configuración actual
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Modelo principal */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 999, background: `color-mix(in srgb, ${accentColor} 18%, transparent)`, color: accentColor }}>
                Principal
              </span>
              {primary.unknown && <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706' }}>Fuera del catálogo</span>}
              {primary.deprecated && <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706' }}>Deprecado</span>}
            </div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.3 }}>{primary.name}</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: 'var(--muted-foreground)', wordBreak: 'break-all' }}>{primary.id}</p>
          </div>

          {/* Respaldos */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: fallbacks.length > 0 ? 8 : 0 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>
                Modelos de respaldo <span style={{ fontWeight: 600, color: 'var(--muted-foreground)' }}>(solo Hugging Face)</span>
              </p>
              {canAddFallback && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); setPopupOpen(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 8, border: `1px solid color-mix(in srgb, ${accentColor} 40%, var(--border))`, background: `color-mix(in srgb, ${accentColor} 8%, var(--card))`, color: accentColor, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  + Asignar
                </button>
              )}
            </div>

            {fallbacks.length === 0 ? (
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>
                {canAddFallback ? 'Sin modelo de respaldo. Usa el botón para asignar uno.' : 'Ninguno configurado. Elige uno abajo — solo modelos hf/ del hub.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fallbacks.map((fb, idx) => (
                  <div key={fb.id} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-foreground)' }}>#{idx + 1}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 999, background: 'var(--muted)', color: 'var(--muted-foreground)' }}>Respaldo</span>
                      {fb.unknown && <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706' }}>Fuera del catálogo</span>}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{fb.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 10, fontFamily: 'ui-monospace, monospace', color: 'var(--muted-foreground)', wordBreak: 'break-all' }}>{fb.id}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Popup selector de respaldo */}
      {popupOpen && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 16 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPopupOpen(false); }}
        >
          <div style={{ width: '100%', maxWidth: 440, background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Asignar modelo de respaldo</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>Solo modelos Hugging Face (hf/)</p>
              </div>
              <button type="button" onClick={() => setPopupOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: 'var(--muted-foreground)', lineHeight: 1 }}>×</button>
            </div>

            {/* Buscador */}
            <div style={{ padding: '12px 18px 8px' }}>
              <input
                autoFocus
                placeholder="Buscar modelo HF..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Lista */}
            <div style={{ maxHeight: 280, overflowY: 'auto', padding: '4px 18px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', textAlign: 'center', padding: '20px 0' }}>
                  {query ? 'Sin resultados.' : 'No hay modelos HF disponibles.'}
                </p>
              ) : filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onAddFallback!(m.id); setPopupOpen(false); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `color-mix(in srgb, ${accentColor} 8%, var(--background))`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--background)'; }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{m.name ?? m.id}</span>
                  <span style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace', color: 'var(--muted-foreground)' }}>{m.id}</span>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
