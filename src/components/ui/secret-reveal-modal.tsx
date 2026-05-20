'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, X } from 'lucide-react';

type SecretRevealModalProps = {
  open: boolean;
  title: string;
  description: string;
  secret: string;
  onClose: () => void;
};

export function SecretRevealModal({
  open,
  title,
  description,
  secret,
  onClose,
}: SecretRevealModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-modal-title"
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
          width: 'min(480px, 100%)',
          borderRadius: 16,
          border: '1px solid rgba(248,118,0,0.35)',
          background: 'var(--card)',
          padding: 22,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <h2 id="secret-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              {title}
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
              {description}
            </p>
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
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(248,118,0,0.08)',
            border: '1px solid rgba(248,118,0,0.28)',
          }}
        >
          <code
            style={{
              display: 'block',
              fontSize: 13,
              wordBreak: 'break-all',
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--foreground)',
            }}
          >
            {secret}
          </code>
        </div>

        <p style={{ margin: '12px 0 0', fontSize: 11, color: '#c45a00', fontWeight: 600 }}>
          Guárdalo ahora. No podrás verlo completo de nuevo.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => void copySecret()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              borderRadius: 10,
              border: '1px solid rgba(248,118,0,0.35)',
              background: 'rgba(248,118,0,0.1)',
              color: '#c45a00',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            {copied ? 'Copiado' : 'Copiar secreto'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--primary)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
