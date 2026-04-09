'use client';

import { useEffect, useState } from 'react';
import {
  PLAN_DISPLAY,
  PLAN_FEATURE_BULLETS,
  planChangeDirection,
  planRank,
} from '@/lib/plan-catalog';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

export type PaidPlanId = 'starter' | 'growth' | 'business';

type PlanChangeModalProps = {
  open: boolean;
  onClose: () => void;
  /** Plan actual (free, starter, …) */
  fromPlanId: string;
  targetPlanId: PaidPlanId;
  /**
   * true = ya hay suscripción de pago en Stripe → cambio con proration en factura.
   * false = primera suscripción o pago vía Checkout (redirección a Stripe).
   */
  usesStripeSubscription: boolean;
  onConfirm: () => Promise<void>;
  isBusy: boolean;
};

export function PlanChangeModal({
  open,
  onClose,
  fromPlanId,
  targetPlanId,
  usesStripeSubscription,
  onConfirm,
  isBusy,
}: PlanChangeModalProps) {
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (!open) setStep(1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const fromLabel = (PLAN_DISPLAY[fromPlanId] ?? PLAN_DISPLAY.free).label;
  const target = PLAN_DISPLAY[targetPlanId];
  const bullets = PLAN_FEATURE_BULLETS[targetPlanId];
  const direction = planChangeDirection(fromPlanId, targetPlanId);
  const isUpgrade = direction === 'upgrade';

  async function handleConfirm() {
    await onConfirm();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
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
          maxHeight: 'min(90vh, 640px)',
          overflow: 'auto',
          borderRadius: '16px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 20px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h2 id="plan-modal-title" style={{ fontSize: '18px', fontWeight: 800, margin: 0, lineHeight: 1.25 }}>
              {step === 1
                ? isUpgrade
                  ? `Mejorar a ${target.label}`
                  : direction === 'downgrade'
                    ? `Cambiar a ${target.label}`
                    : `Plan ${target.label}`
                : 'Confirmar cambio'}
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '6px 0 0' }}>
              {step === 1 ? (
                <>
                  Plan actual: <strong style={{ color: 'var(--foreground)' }}>{fromLabel}</strong>
                  {' → '}
                  <strong style={{ color: '#0d9488' }}>{target.label}</strong>
                  {' · '}
                  {target.priceLabel}
                </>
              ) : (
                <>Revisa los cargos o el siguiente paso antes de continuar.</>
              )}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            disabled={isBusy}
            onClick={onClose}
            style={{
              flexShrink: 0,
              padding: '6px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--muted-foreground)',
              cursor: isBusy ? 'not-allowed' : 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          {step === 1 && (
            <>
              <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>
                {isUpgrade ? 'Qué ganas con este plan' : 'Qué incluye este plan'}
              </p>
              <ul style={{ margin: '0 0 18px', paddingLeft: '0', listStyle: 'none' }}>
                {bullets.map((line) => (
                  <li
                    key={line}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      fontSize: '13px',
                      lineHeight: 1.45,
                      marginBottom: '8px',
                      color: 'var(--foreground)',
                    }}
                  >
                    <CheckCircle2 size={16} style={{ color: '#0d9488', flexShrink: 0, marginTop: '2px' }} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              {isUpgrade && fromPlanId !== 'free' && planRank(fromPlanId) < planRank(targetPlanId) && (
                <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', lineHeight: 1.5, marginBottom: '16px' }}>
                  Pasar de {fromLabel} a {target.label} amplía límites y funciones según lo indicado arriba.
                </p>
              )}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onClose}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    fontWeight: 600,
                    fontSize: '13px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--foreground)',
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setStep(2)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '13px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #0d9488, #6366f1)',
                    color: '#fff',
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Actualizar
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.35)',
                  marginBottom: '14px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                }}
              >
                <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '12px', lineHeight: 1.55, color: 'var(--foreground)' }}>
                  {usesStripeSubscription ? (
                    direction === 'downgrade' ? (
                      <>
                        <strong>Bajada de plan y proration.</strong> Stripe recalcula el periodo en curso: suele
                        aplicarse un <strong>crédito proporcional</strong> por la parte no usada del plan anterior,
                        que verás reflejada en la próxima factura o como saldo. El importe exacto lo confirma Stripe
                        (no lo mostramos aquí en tiempo real).
                      </>
                    ) : (
                      <>
                        <strong>Subida de plan y proration.</strong> Al tener ya una suscripción activa, el cambio se
                        factura con <strong>ajuste proporcional (proration)</strong>: Stripe cobra la diferencia por el
                        tiempo que resta del periodo actual (o lo suma a la siguiente factura, según tu cuenta). El cargo
                        inmediato puede ser distinto del precio mensual completo.
                      </>
                    )
                  ) : (
                    <>
                      <strong>Pago con Stripe Checkout.</strong> Te llevaremos a una página segura de Stripe para
                      introducir o confirmar el método de pago. Tras completar el pago, tu plan se activará y lo verás
                      reflejado en el panel en unos segundos.
                    </>
                  )}
                </div>
              </div>

              <ul style={{ margin: '0 0 16px', paddingLeft: '18px', fontSize: '12px', lineHeight: 1.55, color: 'var(--muted-foreground)' }}>
                <li style={{ marginBottom: '6px' }}>
                  Recibirás el comprobante y el detalle de líneas de factura en el email asociado a tu cuenta de Stripe.
                </li>
                <li style={{ marginBottom: '6px' }}>
                  Puedes revisar facturas, tarjeta y cancelaciones en{' '}
                  <strong style={{ color: 'var(--foreground)' }}>Ajustes</strong> (facturas y método de pago) cuando lo necesites.
                </li>
                {usesStripeSubscription && (
                  <li>
                    Al confirmar, aceptas el cambio de plan y las condiciones de facturación que aplique Stripe según tu periodo actual.
                  </li>
                )}
              </ul>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setStep(1)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    fontWeight: 600,
                    fontSize: '13px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--foreground)',
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleConfirm}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '13px',
                    border: 'none',
                    background: '#0d9488',
                    color: '#fff',
                    cursor: isBusy ? 'wait' : 'pointer',
                    opacity: isBusy ? 0.85 : 1,
                  }}
                >
                  {isBusy ? 'Procesando…' : usesStripeSubscription ? 'Confirmar y aplicar cambio' : 'Ir al pago seguro'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
