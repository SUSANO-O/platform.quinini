'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from '@/components/ui/icons';

/**
 * Modal genérico de solo lectura para mostrar una métrica/gráfico extra del
 * dashboard (distribución horaria, sentiment, etc.). No es de confirmación
 * (ver ConfirmDialog) ni de secretos (ver SecretRevealModal) — es un shell
 * compartido para que cada métrica no tenga que reimplementar backdrop/ESC/foco.
 */
export function DashboardMetricModal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-metric-modal-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(2,6,23,0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        className="card-texture"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          maxHeight: '85vh',
          overflowY: 'auto',
          borderRadius: 16,
          border: '1px solid var(--border-subtle)',
          background: 'var(--card)',
          padding: 22,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <h2 id="dashboard-metric-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              {title}
            </h2>
            {description && (
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'transparent',
              width: 32,
              height: 32,
              flexShrink: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ marginTop: 16 }}>{children}</div>
      </div>
    </div>
  );
}

/** Botón chico de "atajo" debajo de un gráfico, para abrir uno de estos modales. */
export function DashboardMetricShortcut({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        border: '1px solid var(--border-subtle)',
        background: 'rgba(42, 120, 214, 0.05)',
        color: 'var(--foreground)',
        fontSize: 11.5,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
