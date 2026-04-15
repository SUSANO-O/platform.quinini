'use client';

import { X } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
};

export function McpConnectModal({ open, title, children, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-connect-modal-title"
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 'min(90vh, 720px)',
          overflow: 'auto',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--foreground)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '16px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h2 id="mcp-connect-modal-title" style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              cursor: 'pointer',
              color: 'var(--foreground)',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '18px' }}>{children}</div>
      </div>
    </div>
  );
}
