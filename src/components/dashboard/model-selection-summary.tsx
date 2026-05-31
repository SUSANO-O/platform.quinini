'use client';

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

export function ModelSelectionSummary({
  primaryId,
  fallbackIds,
  models,
  accentColor = 'var(--primary)',
}: {
  primaryId: string;
  fallbackIds: string[];
  models: ClientModelOption[];
  accentColor?: string;
}) {
  const primary = primaryId.trim() ? resolveModel(primaryId, models) : null;
  const fallbacks = fallbackIds.map((id) => resolveModel(id, models));

  if (!primary) {
    return (
      <div
        style={{
          marginBottom: 12,
          padding: '12px 14px',
          borderRadius: 12,
          border: '1px dashed var(--border)',
          background: 'var(--muted)',
          fontSize: 12,
          color: 'var(--muted-foreground)',
        }}
      >
        Selecciona un modelo principal en la lista de abajo.
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: 12,
        padding: '14px 16px',
        borderRadius: 12,
        border: `1px solid color-mix(in srgb, ${accentColor} 35%, var(--border))`,
        background: `color-mix(in srgb, ${accentColor} 6%, var(--card))`,
      }}
    >
      <p
        style={{
          margin: '0 0 10px',
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--muted-foreground)',
        }}
      >
        Configuración actual
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                padding: '2px 8px',
                borderRadius: 999,
                background: `color-mix(in srgb, ${accentColor} 18%, transparent)`,
                color: accentColor,
              }}
            >
              Principal
            </span>
            {primary.unknown && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706' }}>Fuera del catálogo</span>
            )}
            {primary.deprecated && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706' }}>Deprecado</span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.3 }}>
            {primary.name}
          </p>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--muted-foreground)',
              wordBreak: 'break-all',
            }}
          >
            {primary.id}
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>
            Modelos de respaldo <span style={{ fontWeight: 600, color: 'var(--muted-foreground)' }}>(solo Hugging Face)</span>
          </p>
          {fallbacks.length === 0 ? (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>
              Ninguno configurado. Elige uno abajo — solo modelos <strong>hf/</strong> del hub.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fallbacks.map((fb, idx) => (
                <div
                  key={fb.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-foreground)' }}>
                      #{idx + 1}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '1px 6px',
                        borderRadius: 999,
                        background: 'var(--muted)',
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      Respaldo
                    </span>
                    {fb.unknown && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706' }}>Fuera del catálogo</span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{fb.name}</p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: 10,
                      fontFamily: 'ui-monospace, monospace',
                      color: 'var(--muted-foreground)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {fb.id}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
