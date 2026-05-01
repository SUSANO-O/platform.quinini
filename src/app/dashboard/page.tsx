'use client';

import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { QuotaTopupBanner } from '@/components/dashboard/quota-topup-banner';
import { SubscriptionStatusHero } from '@/components/dashboard/subscription-status-hero';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Cpu, Boxes, Zap, Clock, CheckCircle, Bot, Sparkles } from 'lucide-react';

interface UsageData {
  used: number;
  limit: number;
  percentUsed: number;
  plan: string;
  platformCycleKey?: string;
  platformFreeLimit?: number;
  platformFreeUsed?: number;
  platformFreeRemaining?: number;
  activePacks: { packId: string; remaining: number; total: number; expiresAt: string }[];
}

/* Misma lógica de color que el index (#e41414 y familia) */
const R = '#e41414';
const O = '#f87600';
const B = '#00acf8';

const PLANS = [
  { id: 'starter', name: 'Starter', price: '$19', priceSuffix: '/mes', widgets: 3, agents: 2, requests: '50k req/mes', color: B, popular: false },
  { id: 'growth', name: 'Growth', price: '$49', priceSuffix: '/mes', widgets: 6, agents: 5, requests: '200k req/mes', color: R, popular: true },
  { id: 'business', name: 'Business', price: '$129', priceSuffix: '/mes', widgets: 12, agents: 15, requests: 'Ilimitado', color: O, popular: false },
] as const;

const QUICK = [
  { href: '/dashboard/widget-builder', icon: Cpu, title: 'Widget Builder', desc: 'Diseña y configura tu chat widget', color: R, external: false },
  { href: '/dashboard/widgets', icon: Boxes, title: 'Mis Widgets', desc: 'Gestiona tus widgets creados', color: B, external: false },
  { href: '/dashboard/agents', icon: Bot, title: 'Mis Agentes', desc: 'Crea y configura tus agentes de IA', color: O, external: false },
 // { href: '/widget', icon: Zap, title: 'Docs SDK', desc: 'Guía de integración del Widget API', color: B, external: true },
] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { hasAccess, isPremium, isTrialActive, trialDaysRemaining, subscription, startCheckout, loading } = useSubscription();
  const cancelScheduled = Boolean(subscription?.cancelAtPeriodEnd);
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    if (user?.role === 'admin') router.replace('/admin');
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/billing/usage')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setUsage(d))
      .catch(() => {});
  }, [user]);

  const trialUrgent = trialDaysRemaining <= 2;

  return (
    <div className="relative overflow-hidden" style={{ minHeight: '100%' }}>
      <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-80px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: B, top: '120px', left: '-100px' }} />

      <div className="relative px-6 py-10 max-w-4xl mx-auto">
        {usage && (
          <QuotaTopupBanner
            percentUsed={usage.percentUsed}
            used={usage.used}
            limit={usage.limit}
            plan={usage.plan}
            activePacks={usage.activePacks}
          />
        )}
        <div className="badge-primary mb-5 w-fit">Panel</div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          Bienvenido,{' '}
          <span className="gradient-text">{user?.displayName || user?.email?.split('@')[0]}</span>
          <span className="text-foreground"> 👋</span>
        </h1>
        <p className="text-sm mt-1 mb-10" style={{ color: 'var(--muted-foreground)' }}>
          Panel de control de tu cuenta ¿que vas a hacer hoy?.
        </p>

        <SubscriptionStatusHero
          loading={loading}
          isPremium={isPremium}
          isTrialActive={isTrialActive}
          trialUrgent={trialUrgent}
          trialDaysRemaining={trialDaysRemaining}
          subscription={
            subscription
              ? {
                  plan: subscription.plan,
                  currentPeriodEnd: subscription.currentPeriodEnd,
                  cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                }
              : null
          }
          plans={PLANS}
          onCheckout={startCheckout}
          celebrationGifSrc={process.env.NEXT_PUBLIC_SUBSCRIPTION_HERO_GIF}
        />

        {usage && (
          <section
            className="mb-8 rounded-2xl border card-texture"
            style={{
              borderColor: usage.percentUsed >= 80 ? 'rgba(239,68,68,0.35)' : 'var(--border)',
              background:
                usage.percentUsed >= 80
                  ? 'linear-gradient(150deg, rgba(239,68,68,0.08), rgba(248,118,0,0.06), rgba(255,255,255,0.94))'
                  : 'linear-gradient(150deg, rgba(228,20,20,0.06), rgba(0,172,248,0.06), rgba(255,255,255,0.94))',
              boxShadow: '0 8px 28px rgba(15,23,42,0.06)',
            }}
          >
            <div className="p-5 md:p-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p
                    className="m-0 text-[11px] font-bold uppercase tracking-[0.08em]"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    Uso del mes
                  </p>
                  <p className="m-0 mt-1 text-sm font-semibold">
                    Conversaciones del plan <span style={{ textTransform: 'capitalize' }}>{usage.plan}</span>
                  </p>
                </div>
                <div
                  className="rounded-full px-3 py-1 text-xs font-extrabold"
                  style={{
                    color: usage.percentUsed >= 80 ? '#ef4444' : '#0f172a',
                    background:
                      usage.percentUsed >= 80
                        ? 'rgba(239,68,68,0.14)'
                        : 'linear-gradient(90deg, rgba(228,20,20,0.16), rgba(0,172,248,0.14))',
                    border:
                      usage.percentUsed >= 80
                        ? '1px solid rgba(239,68,68,0.35)'
                        : '1px solid rgba(15,23,42,0.08)',
                  }}
                >
                  {usage.percentUsed}%
                </div>
              </div>

              <div
                style={{
                  height: '10px',
                  borderRadius: '999px',
                  background: 'rgba(15,23,42,0.08)',
                  overflow: 'hidden',
                  border: '1px solid rgba(15,23,42,0.06)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(usage.percentUsed, 100)}%`,
                    borderRadius: '999px',
                    background:
                      usage.percentUsed >= 80
                        ? 'linear-gradient(90deg,#f87600,#ef4444)'
                        : 'linear-gradient(90deg,#e41414,#f87600,#00acf8)',
                    transition: 'width 0.45s ease',
                  }}
                />
              </div>

              <div
                className="mt-3 flex items-center justify-between gap-3 text-xs"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <span>
                  {usage.limit === -1
                    ? 'Ilimitado'
                    : `${usage.used.toLocaleString('es')} / ${usage.limit.toLocaleString('es')}`}
                </span>
                {usage.percentUsed >= 80 ? (
                  <Link href="/dashboard/settings" className="font-bold landing-link-accent text-xs">
                    Ajustar plan
                  </Link>
                ) : (
                  <span>Todo en rango</span>
                )}
              </div>

              {typeof usage.platformFreeLimit === 'number' && (
                <div
                  className="mt-3 rounded-xl px-3 py-2 text-xs"
                  title="Cuota gratuita de regalo para usar agentes de plataforma en tu ciclo actual. Al agotarse, los chats pasan a contar en tu cuota normal de conversaciones."
                  style={{
                    background: 'rgba(255,255,255,0.72)',
                    border: '1px solid rgba(15,23,42,0.08)',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  Regalo plataforma: {(usage.platformFreeUsed ?? 0).toLocaleString('es')} /{' '}
                  {usage.platformFreeLimit.toLocaleString('es')} · restan{' '}
                  {(usage.platformFreeRemaining ?? 0).toLocaleString('es')}
                  <div className="mt-1 text-[11px]">
                    Reinicio: {formatPlatformCycleLabel(usage.platformCycleKey, subscription?.currentPeriodEnd)}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Accesos rápidos */}
        <div className="grid sm:grid-cols-2 gap-4 mb-12" data-tour="dashboard-quick-actions">
          {QUICK.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              className="card-hover rounded-2xl overflow-hidden no-underline text-inherit group border"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <div style={{ height: 3, background: `linear-gradient(90deg, ${item.color}, ${item.color}88)` }} />
              <div className="p-5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105"
                  style={{
                    background: `${item.color}12`,
                    border: `1px solid ${item.color}28`,
                  }}
                >
                  <item.icon size={20} style={{ color: item.color }} strokeWidth={1.75} />
                </div>
                <p className="font-bold text-[15px] mb-1">{item.title}</p>
                <p className="text-xs leading-relaxed m-0" style={{ color: 'var(--muted-foreground)' }}>
                  {item.desc}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {isPremium && !cancelScheduled && (
          <div className="mb-10">
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Cambios de plan aplican proration automática en Stripe. Facturas y método de pago:{' '}
              <Link href="/dashboard/settings" className="font-bold landing-link-accent">
                Ajustes → Suscripción
              </Link>
            </p>
          </div>
        )}

        {/* Planes (promo) */}
        {!isPremium && (
          <section
            data-tour="dashboard-upgrade"
            className="rounded-2xl border p-6 md:p-8 -mx-1"
            style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} style={{ color: R }} />
              <h2 className="text-lg md:text-xl font-bold m-0">Elige tu plan</h2>
            </div>
            <p className="text-sm mb-6 m-0" style={{ color: 'var(--muted-foreground)' }}>
              Sin contratos. Cancela cuando quieras — precios alineados con la landing pública.
            </p>

            <div className="grid sm:grid-cols-3 gap-4 md:gap-5">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-2xl p-6 relative pt-7 border"
                  style={{
                    backgroundImage: plan.popular
                      ? `linear-gradient(145deg, rgba(228,20,20,0.05), rgba(248,118,0,0.05)), radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)`
                      : `radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)`,
                    backgroundSize: plan.popular ? 'auto, 20px 20px' : '20px 20px',
                    backgroundColor: 'var(--card)',
                    borderColor: plan.popular ? plan.color : 'var(--border)',
                    boxShadow: plan.popular ? '0 8px 28px rgba(228,20,20,0.1)' : undefined,
                  }}
                >
                  {plan.popular && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
                      style={{
                        top: '-12px',
                        background: `linear-gradient(135deg, ${R}, ${O})`,
                      }}
                    >
                      Más popular
                    </div>
                  )}
                  <p className="font-extrabold text-lg mb-0">{plan.name}</p>
                  <div className="flex items-end gap-1 mb-4 mt-2">
                    <span className="text-3xl font-extrabold" style={{ color: plan.color }}>
                      {plan.price}
                    </span>
                    <span className="text-xs pb-1" style={{ color: 'var(--muted-foreground)' }}>
                      {plan.priceSuffix}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 mb-5">
                    {[`${plan.widgets} widgets`, `${plan.agents} agentes`, plan.requests].map((feat) => (
                      <div key={feat} className="flex items-center gap-2 text-[13px]">
                        <CheckCircle size={14} style={{ color: plan.color, flexShrink: 0 }} />
                        {feat}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => startCheckout(plan.id)}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white border-0 cursor-pointer transition-all hover:opacity-95 hover:shadow-lg"
                    style={{
                      background: plan.popular ? `linear-gradient(135deg, ${R}, ${O})` : plan.color,
                      boxShadow: plan.popular ? '0 4px 18px rgba(228,20,20,0.28)' : undefined,
                    }}
                  >
                    Suscribirse
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {isTrialActive && !isPremium && (
          <div
            className="mt-8 flex items-center gap-3 text-[13px] rounded-xl px-4 py-3 border card-texture"
            style={{ color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}
          >
            <Clock size={16} className="shrink-0" style={{ color: B }} />
            <span>
              Trial iniciado el{' '}
              {subscription?.trialStartedAt
                ? new Date(subscription.trialStartedAt).toLocaleDateString('es', { day: 'numeric', month: 'long' })
                : '—'}
              . Vence el{' '}
              {subscription?.trialEndsAt
                ? new Date(subscription.trialEndsAt).toLocaleDateString('es', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : '—'}
              .
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatPlatformCycleLabel(cycleKey?: string, subscriptionPeriodEnd?: number): string {
  if (cycleKey?.startsWith('sub_end:')) {
    const sec = Number(cycleKey.split(':')[1] ?? 0);
    if (Number.isFinite(sec) && sec > 0) {
      return `con tu renovación (${new Date(sec * 1000).toLocaleDateString('es')})`;
    }
  }
  if (cycleKey?.startsWith('trial_end:')) {
    const dateIso = cycleKey.slice('trial_end:'.length);
    const d = new Date(`${dateIso}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return `al terminar el trial (${d.toLocaleDateString('es')})`;
  }
  if (subscriptionPeriodEnd && subscriptionPeriodEnd > 0) {
    return `con tu renovación (${new Date(subscriptionPeriodEnd * 1000).toLocaleDateString('es')})`;
  }
  return 'sin reinicio mensual automático';
}
