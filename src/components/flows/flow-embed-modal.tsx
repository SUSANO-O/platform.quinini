'use client';

import { useEffect, useState } from 'react';
import { X } from '@/components/ui/icons';
import { DashboardButton } from '@/components/dashboard/dashboard-button';
import { WidgetEmbedPanel } from '@/components/dashboard/widget-embed-panel';

export function FlowEmbedModal({
  open,
  snippet,
  onClose,
}: {
  open: boolean;
  snippet: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !snippet) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flows-admin-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="flows-admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flow-embed-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flows-admin-modal__header">
          <h2 id="flow-embed-title" className="flows-admin-modal__title">Código embed</h2>
          <button type="button" className="flows-admin-modal__close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <p className="flows-admin-modal__hint">
          Copia este código y pégalo antes de la etiqueta de cierre{' '}
          <code className="px-1.5 py-0.5 rounded bg-[var(--muted)] text-[0.8em]">&lt;/body&gt;</code>{' '}
          en tu sitio web.
        </p>
        <WidgetEmbedPanel
          snippet={snippet}
          copied={copied}
          onCopySnippet={() => void copy()}
        />
        <div className="flows-admin-modal__footer">
          <DashboardButton variant="secondary" onClick={onClose}>
            Cancelar
          </DashboardButton>
          <DashboardButton variant="primary" onClick={() => void copy()}>
            {copied ? '¡Copiado!' : 'Copiar código'}
          </DashboardButton>
        </div>
      </div>
    </div>
  );
}
