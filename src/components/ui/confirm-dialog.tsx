'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { BRAND, STATE } from '@/lib/brand-colors';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const confirmColor = variant === 'danger' ? STATE.error : BRAND.primary;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      onClick={() => { if (!loading) onCancel(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(2,6,23,0.45)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        className="card-texture"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          borderRadius: 16,
          padding: 22,
          boxShadow: 'var(--shadow-surface-lg)',
        }}
      >
        <h2 id="confirm-dialog-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          {title}
        </h2>
        <p id="confirm-dialog-desc" style={{ margin: '10px 0 20px', fontSize: 14, color: 'var(--muted-foreground)', lineHeight: 1.55 }}>
          {description}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            ref={cancelRef}
            type="button"
            disabled={loading}
            onClick={onCancel}
            style={{
              padding: '9px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--muted)',
              boxShadow: 'var(--shadow-surface-sm)',
              color: 'var(--foreground)',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              borderRadius: 10,
              border: 'none',
              background: confirmColor,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading && <Loader2 className="animate-spin" size={14} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
