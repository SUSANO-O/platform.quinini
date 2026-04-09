'use client';

import { useEffect, useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripePromise } from '@/lib/stripe-client';
import { toast } from 'sonner';
import { X } from 'lucide-react';

function SetupForm({
  onSaved,
  onClose,
}: {
  onSaved: () => void;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url:
          typeof window !== 'undefined'
            ? `${window.location.origin}/dashboard/settings?setup=return`
            : '',
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || 'No se pudo confirmar el método de pago.');
      return;
    }
    if (setupIntent?.status === 'succeeded' && setupIntent.id) {
      const r = await fetch('/api/billing/setup-intent/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupIntentId: setupIntent.id }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'Error al guardar la tarjeta.');
        return;
      }
      toast.success(data.message || 'Método de pago actualizado.');
      onSaved();
      onClose();
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '16px' }}>
        <PaymentElement />
      </div>
      <button
        type="submit"
        disabled={!stripe || loading}
        style={{
          width: '100%',
          padding: '11px 16px',
          borderRadius: '10px',
          fontWeight: 700,
          fontSize: '14px',
          border: 'none',
          background: '#0d9488',
          color: '#fff',
          cursor: loading || !stripe ? 'wait' : 'pointer',
          opacity: !stripe ? 0.6 : 1,
        }}
      >
        {loading ? 'Guardando…' : 'Guardar método de pago'}
      </button>
    </form>
  );
}

type UpdatePaymentModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function UpdatePaymentModal({ open, onClose, onSaved }: UpdatePaymentModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [stripePromise] = useState(() => getStripePromise());

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setLoadError(null);
      return;
    }
    if (!stripePromise) {
      setLoadError(
        'Falta la clave publicable de Stripe (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY). Añádela al .env y reinicia.',
      );
      return;
    }
    setLoadingSecret(true);
    setLoadError(null);
    fetch('/api/billing/setup-intent', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setLoadError(d.error);
        else if (d.clientSecret) setClientSecret(d.clientSecret);
        else setLoadError('Respuesta inválida del servidor.');
      })
      .catch(() => setLoadError('No se pudo conectar. Intenta de nuevo.'))
      .finally(() => setLoadingSecret(false));
  }, [open, stripePromise]);

  if (!open) return null;

  const appearance =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? ({ theme: 'night' as const } satisfies { theme: 'night' })
      : ({ theme: 'stripe' as const } satisfies { theme: 'stripe' });

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
          maxHeight: '90vh',
          overflow: 'auto',
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
              Datos procesados por Stripe. No almacenamos el número de tarjeta en nuestros servidores.
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
        {loadingSecret && !loadError && <p style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Preparando formulario…</p>}

        {stripePromise && clientSecret && !loadError && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance,
            }}
          >
            <SetupForm onSaved={onSaved} onClose={onClose} />
          </Elements>
        )}
      </div>
    </div>
  );
}
