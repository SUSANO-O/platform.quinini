'use client';

import { useState } from 'react';
import { useSubscription } from '@/hooks/use-subscription';
import { PLAN_DISPLAY, PAID_PLAN_IDS, planRank } from '@/lib/plan-catalog';
import { PlanChangeModal, type PaidPlanId } from '@/components/dashboard/plan-change-modal';
import { ChevronRight, Crown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** Panel de plan (subir/bajar) — pensado para Ajustes → Suscripción. */
export function SubscriptionPlanPanel({ checkoutDisabled = false }: { checkoutDisabled?: boolean }) {
  const { subscription, isRefreshing, startCheckout } = useSubscription();
  const [busy, setBusy] = useState<string | null>(null);
  const [modalPlan, setModalPlan] = useState<PaidPlanId | null>(null);

  const hasPaidSubscriptionUi =
    subscription &&
    ['active', 'trialing', 'past_due'].includes(subscription.status);

  const hasActivePlan =
    subscription?.status === 'active' ||
    subscription?.status === 'trialing' ||
    subscription?.status === 'past_due';

  const effectivePlan = hasActivePlan ? (subscription?.plan ?? 'free') : 'free';
  const current = PLAN_DISPLAY[effectivePlan] ?? PLAN_DISPLAY.free;

  const rank = planRank(effectivePlan);
  const upgrades = PAID_PLAN_IDS.filter((id) => planRank(id) > rank);
  const downgrades = PAID_PLAN_IDS.filter((id) => planRank(id) < rank).sort((a, b) => planRank(b) - planRank(a));

  async function executePlanChange() {
    if (!modalPlan) return;
    setBusy(modalPlan);
    const err = await startCheckout(modalPlan);
    setBusy(null);
    if (err && 'error' in err && err.error) {
      toast.error(err.error);
      return;
    }
    if (err && 'message' in err && err.message) {
      toast.success(err.message);
    }
    setModalPlan(null);
  }

  function PlanRow({ id, accent }: { id: PaidPlanId; accent: 'up' | 'down' }) {
    const p = PLAN_DISPLAY[id];
    const loading = busy === id;
    const border =
      accent === 'up'
        ? '1px solid var(--border)'
        : '1px solid rgba(239,68,68,0.22)';
    const bg = accent === 'up' ? 'var(--background)' : 'rgba(239,68,68,0.04)';
    const chevron = accent === 'up' ? '#00acf8' : '#f87171';

    return (
      <button
        type="button"
        disabled={!!busy || checkoutDisabled}
        onClick={() => setModalPlan(id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '6px 8px',
          borderRadius: '8px',
          border,
          background: bg,
          fontSize: '11px',
          fontWeight: 600,
          cursor: busy || checkoutDisabled ? 'not-allowed' : 'pointer',
          opacity: busy || checkoutDisabled ? 0.55 : 1,
          color: 'var(--foreground)',
          textAlign: 'left',
        }}
      >
        <span>
          {p.label}{' '}
          <span style={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>{p.priceLabel}</span>
        </span>
        {loading ? (
          <Loader2 size={12} style={{ color: chevron, animation: 'spin 0.8s linear infinite' }} />
        ) : (
          <ChevronRight size={12} style={{ color: chevron }} />
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        marginBottom: '20px',
        padding: '12px',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: 'linear-gradient(145deg, rgba(228,20,20,0.06), rgba(0,172,248,0.06))',
      }}
    >
      {checkoutDisabled && (
        <p
          className="text-[11px] font-semibold m-0 mb-3 leading-snug rounded-lg px-3 py-2.5 border"
          style={{
            borderColor: 'rgba(217,119,6,0.35)',
            background: 'rgba(217,119,6,0.08)',
            color: '#b45309',
          }}
        >
          Verifica tu correo en Ajustes para poder contratar o cambiar de plan.
        </p>
      )}

      <PlanChangeModal
        open={modalPlan !== null}
        onClose={() => !busy && setModalPlan(null)}
        fromPlanId={effectivePlan}
        targetPlanId={modalPlan ?? 'starter'}
        isExistingPaidSubscription={Boolean(hasPaidSubscriptionUi)}
        onConfirm={executePlanChange}
        isBusy={Boolean(busy)}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Tu plan
        </span>
        {isRefreshing && (
          <Loader2 size={12} style={{ color: 'var(--primary)', opacity: 0.8, animation: 'spin 0.8s linear infinite' }} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <Crown size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '14px', fontWeight: 800, margin: 0, textTransform: 'capitalize', lineHeight: 1.2 }}>
            {current.label}
          </p>
          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
            {current.priceLabel} · {current.widgets} widget{current.widgets !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {upgrades.length > 0 && (
        <>
          <p
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--muted-foreground)',
              margin: '0 0 6px',
              textTransform: 'uppercase',
            }}
          >
            Subir de plan
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: downgrades.length > 0 ? '12px' : 0 }}>
            {upgrades.map((id) => (
              <PlanRow key={`up-${id}`} id={id} accent="up" />
            ))}
          </div>
        </>
      )}

      {downgrades.length > 0 && (
        <>
          <p
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--muted-foreground)',
              margin: '0 0 6px',
              textTransform: 'uppercase',
            }}
          >
            Bajar de plan
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {downgrades.map((id) => (
              <PlanRow key={`down-${id}`} id={id} accent="down" />
            ))}
          </div>
          <p style={{ fontSize: '9px', color: 'var(--muted-foreground)', margin: '8px 0 0', lineHeight: 1.35 }}>
            La bajada aplica prorrateo en Paddle: puede acreditarse la parte no usada del periodo actual (detalle en la
            factura o en el resumen de la suscripción).
          </p>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
