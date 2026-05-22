'use client';

import type { CSSProperties } from 'react';

type AiLoadingScreenProps = {
  fullScreen?: boolean;
  compact?: boolean;
  label?: string;
};

type AiLoadingBlockProps = {
  label: string;
  hint?: string;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
};

const DOT_COUNT = 4;

function LoadingDots() {
  return (
    <>
      {Array.from({ length: DOT_COUNT }, (_, i) => (
        <span key={i} className="ai-loader__dot-wrap" style={{ ['--i' as string]: i }}>
          <span className="ai-loader__dot-shadow" />
          <span className="ai-loader__dot" />
        </span>
      ))}
    </>
  );
}

export function AiLoadingScreen({
  fullScreen = true,
  compact = false,
  label,
}: AiLoadingScreenProps) {
  return (
    <div
      className={[
        'ai-loader',
        fullScreen ? 'ai-loader--fullscreen' : '',
        compact ? 'ai-loader--compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="ai-loader__dots" aria-hidden>
        <LoadingDots />
      </div>

      {label ? <p className="ai-loader__label">{label}</p> : null}
      <span className="sr-only">{label ?? 'Cargando…'}</span>
    </div>
  );
}

export function AiLoadingDots({ className = '' }: { className?: string }) {
  return (
    <div className={`ai-loader ai-loader--inline ${className}`.trim()} role="status" aria-label="Cargando">
      <div className="ai-loader__dots" aria-hidden>
        <LoadingDots />
      </div>
    </div>
  );
}

/** Bloque en tarjeta — listas, secciones y vistas previa. */
export function AiLoadingBlock({
  label,
  hint,
  compact = false,
  className = '',
  style,
}: AiLoadingBlockProps) {
  return (
    <div
      className={['card-texture', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 14 : 18,
        padding: compact ? '28px 20px' : '44px 28px',
        borderRadius: 16,
        maxWidth: compact ? 280 : 320,
        margin: compact ? '4px 0' : '8px auto 24px',
        ...style,
      }}
    >
      <AiLoadingDots />
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--foreground)', textAlign: 'center' }}>
        {label}
      </p>
      {hint ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)', textAlign: 'center' }}>{hint}</p>
      ) : null}
    </div>
  );
}

/** Centrado sin tarjeta — listas de agentes, widgets, tablas admin. */
export function AiLoadingInline({
  label,
  hint,
  className = '',
  style,
}: {
  label: string;
  hint?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '48px 16px',
        ...style,
      }}
    >
      <AiLoadingDots />
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{label}</p>
      {hint ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)', textAlign: 'center' }}>{hint}</p>
      ) : null}
    </div>
  );
}

/** Fila compacta — catálogos MCP y campos inline. */
export function AiLoadingRow({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--muted-foreground)', fontSize: 13 }}
    >
      <AiLoadingDots className="ai-loader--compact" />
      <span>{label}</span>
    </div>
  );
}
