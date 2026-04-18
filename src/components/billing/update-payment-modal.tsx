'use client';

/**
 * Modal para actualizar el método de pago.
 * Migrado de Stripe Elements → redirección a la URL de gestión de Paddle.
 *
 * Flujo Paddle:
 *   1. POST /api/billing/payment-method-url  →  { url }
 *   2. window.location.href = url  →  portal seguro de Paddle
 *
 * ─── Stripe Elements (comentado — conservado para referencia) ────────────
 * // import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
 * // import { getStripePromise } from '@/lib/stripe-client';
 * // function SetupForm({ onSaved, onClose }) { ... stripe.confirmSetup() ... }
 * → Ver git history para la implementación completa con Stripe Elements.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X, ExternalLink } from 'lucide-react';

type UpdatePaymentModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function UpdatePaymentModal({ open, onClose }: UpdatePaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setLoadError(null);
  }, [open]);

  if (!open) return null;

  async function handleRedirect() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/billing/payment-method-url', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setLoadError(data.error || 'No se pudo obtener la URL de Paddle.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setLoadError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(0,0,0,0.55)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          borderRadius: '16px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          padding: '20px',
          boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 800, margin: 0 }}>Método de pago</h2>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '6px 0 0', lineHeight: 1.4 }}>
              Serás redirigido al portal seguro de Paddle para actualizar tu tarjeta.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            style={{
              padding: '6px',
              border: 'none',
              background: 'transparent',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {loadError && (
          <p style={{ fontSize: '13px', color: '#ef4444', marginBottom: '12px' }}>{loadError}</p>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={handleRedirect}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '11px 16px',
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '14px',
            border: 'none',
            background: '#0d9488',
            color: '#fff',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Redirigiendo…' : (
            <>
              Actualizar método de pago
              <ExternalLink size={14} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
