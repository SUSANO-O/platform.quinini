'use client';

import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Cpu, Boxes, Zap, Clock, CheckCircle, Bot } from 'lucide-react';

const PLANS = [
  { id: 'starter', name: 'Starter', price: '$19/mes', widgets: 3, agents: 2, requests: '50k req/mes', color: '#0d9488' },
  { id: 'growth', name: 'Growth', price: '$49/mes', widgets: 6, agents: 5, requests: '200k req/mes', color: '#6366f1', popular: true },
  { id: 'business', name: 'Business', price: '$129/mes', widgets: 12, agents: 15, requests: 'Ilimitado', color: '#a855f7' },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { hasAccess, isPremium, isTrialActive, trialDaysRemaining, subscription, startCheckout, loading } = useSubscription();
  const cancelScheduled = Boolean(subscription?.cancelAtPeriodEnd);

  useEffect(() => {
    if (user?.role === 'admin') router.replace('/admin');
  }, [user, router]);

  const trialUrgent = trialDaysRemaining <= 2;

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '4px' }}>
        Bienvenido, {user?.displayName || user?.email?.split('@')[0]} 👋
      </h1>
      <p style={{ color: 'var(--muted-foreground)', fontSize: '14px', marginBottom: '32px' }}>
        Panel de control de AgentFlow
      </p>

      {/* Subscription status banner */}
      {!loading && (
        <div style={{
          borderRadius: '14px', padding: '20px 24px', marginBottom: '32px',
          background: isPremium
            ? 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(99,102,241,0.12))'
            : isTrialActive
              ? trialUrgent ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)'
              : 'rgba(239,68,68,0.08)',
          border: `1px solid ${isPremium ? 'rgba(13,148,136,0.25)' : (trialUrgent || !isTrialActive) ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
          display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: '28px' }}>
            {isPremium ? '✅' : isTrialActive ? (trialUrgent ? '⚠️' : '⏳') : '🔒'}
          </div>
          <div style={{ flex: 1 }}>
            {isPremium ? (
              <>
                <p style={{ fontWeight: 700, fontSize: '15px', marginBottom: '2px' }}>
                  Plan activo: <span style={{ textTransform: 'capitalize' }}>{subscription?.plan}</span>
                </p>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>Tu suscripción está activa.</p>
              </>
            ) : isTrialActive ? (
              <>
                <p style={{ fontWeight: 700, fontSize: '15px', marginBottom: '2px', color: trialUrgent ? '#ef4444' : '#f59e0b' }}>
                  {trialDaysRemaining === 0 ? 'Último día de trial' : `Trial: ${trialDaysRemaining} día${trialDaysRemaining !== 1 ? 's' : ''} restante${trialDaysRemaining !== 1 ? 's' : ''}`}
                </p>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>
                  {trialUrgent ? '¡Tu prueba está por vencer! Suscríbete para no perder el acceso.' : 'Estás usando el período de prueba gratuita de 5 días.'}
                </p>
              </>
            ) : (
              <>
                <p style={{ fontWeight: 700, fontSize: '15px', marginBottom: '2px', color: '#ef4444' }}>Trial vencido</p>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>
                  Tu período de prueba ha terminado. Elige un plan para continuar.
                </p>
              </>
            )}
          </div>
          {!isPremium && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => startCheckout(plan.id)}
                  style={{
                    padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                    background: plan.color, color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  {plan.name} {plan.price}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '40px' }}>
        <Link href="/dashboard/widget-builder" style={{
          display: 'block', padding: '20px', borderRadius: '14px', textDecoration: 'none',
          background: 'linear-gradient(135deg, rgba(13,148,136,0.1), rgba(99,102,241,0.1))',
          border: '1px solid rgba(13,148,136,0.2)',
        }}>
          <Cpu size={24} style={{ color: '#0d9488', marginBottom: '10px' }} />
          <p style={{ fontWeight: 700, marginBottom: '4px' }}>Widget Builder</p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>Diseña y configura tu chat widget</p>
        </Link>

        <Link href="/dashboard/widgets" style={{
          display: 'block', padding: '20px', borderRadius: '14px', textDecoration: 'none',
          background: 'var(--card)', border: '1px solid var(--border)',
        }}>
          <Boxes size={24} style={{ color: '#6366f1', marginBottom: '10px' }} />
          <p style={{ fontWeight: 700, marginBottom: '4px' }}>Mis Widgets</p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>Gestiona tus widgets creados</p>
        </Link>

        <Link href="/dashboard/agents" style={{
          display: 'block', padding: '20px', borderRadius: '14px', textDecoration: 'none',
          background: 'var(--card)', border: '1px solid var(--border)',
        }}>
          <Bot size={24} style={{ color: '#a855f7', marginBottom: '10px' }} />
          <p style={{ fontWeight: 700, marginBottom: '4px' }}>Mis Agentes</p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>Crea y configura tus agentes de IA</p>
        </Link>

        <Link href="/widget" target="_blank" style={{
          display: 'block', padding: '20px', borderRadius: '14px', textDecoration: 'none',
          background: 'var(--card)', border: '1px solid var(--border)',
        }}>
          <Zap size={24} style={{ color: '#f59e0b', marginBottom: '10px' }} />
          <p style={{ fontWeight: 700, marginBottom: '4px' }}>Docs SDK</p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>Guía de integración del Widget SDK</p>
        </Link>
      </div>

      {isPremium && !cancelScheduled && (
        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '8px' }}>
            Cambios de plan aplican proration automática en Stripe. Facturas y método de pago:{' '}
            <Link href="/dashboard/settings" style={{ color: '#6366f1', fontWeight: 700 }}>Ajustes → Suscripción</Link>
          </p>
        </div>
      )}

      {/* Plans */}
      {!isPremium && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>Elige tu plan</h2>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '20px' }}>Sin contratos, cancela en cualquier momento.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {PLANS.map((plan) => (
              <div key={plan.id} style={{
                background: 'var(--card)', border: `1px solid ${plan.popular ? plan.color : 'var(--border)'}`,
                borderRadius: '14px', padding: '24px', position: 'relative',
              }}>
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                    background: plan.color, color: '#fff', fontSize: '11px', fontWeight: 700,
                    padding: '3px 12px', borderRadius: '20px',
                  }}>Más popular</div>
                )}
                <p style={{ fontWeight: 800, fontSize: '18px', marginBottom: '4px' }}>{plan.name}</p>
                <p style={{ fontSize: '22px', fontWeight: 800, color: plan.color, marginBottom: '16px' }}>{plan.price}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {[`${plan.widgets} widgets`, `${plan.agents} agentes`, plan.requests].map((feat) => (
                    <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <CheckCircle size={14} style={{ color: plan.color, flexShrink: 0 }} />
                      {feat}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => startCheckout(plan.id)}
                  style={{
                    width: '100%', padding: '10px', borderRadius: '10px', fontWeight: 700,
                    fontSize: '13px', background: plan.color, color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  Suscribirse
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isTrialActive && !isPremium && (
        <div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
          <Clock size={16} />
          Trial iniciado el{' '}
          {subscription?.trialStartedAt ? new Date(subscription.trialStartedAt).toLocaleDateString('es', { day: 'numeric', month: 'long' }) : '—'}.
          {' '}Vence el{' '}
          {subscription?.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}.
        </div>
      )}
    </div>
  );
}
