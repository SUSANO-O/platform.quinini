'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Crown, ShieldCheck, Sparkles } from 'lucide-react';

const STORAGE_KEY = 'af_dashboard_subscription_hero_intro_v1';

const R = '#e41414';
const O = '#f87600';
const B = '#00acf8';

type Props = {
  loading: boolean;
  isPremium: boolean;
  isTrialActive: boolean;
  trialUrgent: boolean;
  trialDaysRemaining: number;
  subscription: {
    plan: string;
    currentPeriodEnd?: number;
    cancelAtPeriodEnd?: boolean;
  } | null;
  plans: readonly {
    id: string;
    name: string;
    price: string;
    priceSuffix: string;
    color: string;
    popular?: boolean;
  }[];
  onCheckout: (planId: string) => void;
  /**
   * Opcional: GIF/WebP en `/public` (ej. `"/celebration-once.gif"`).
   * Se muestra solo en la primera visita al dashboard en la sesión, encima del badge SVG.
   */
  celebrationGifSrc?: string;
};

function formatPeriodEnd(epochSec?: number): string | null {
  if (epochSec == null || !Number.isFinite(epochSec)) return null;
  const d = new Date(epochSec * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ConfettiBurst({ active }: { active: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        tx: (Math.random() - 0.5) * 120,
        ty: (Math.random() - 0.5) * 100 - 20,
        rot: Math.random() * 360,
        delay: Math.random() * 0.15,
        hue: i % 3 === 0 ? R : i % 3 === 1 ? O : B,
        size: 4 + Math.random() * 5,
      })),
    [],
  );

  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute left-1/2 top-[42%] rounded-sm opacity-0"
          style={{
            width: p.size,
            height: p.size * (0.6 + Math.random() * 0.4),
            background: p.hue,
            animation: `sub-hero-confetti 1.1s cubic-bezier(0.22, 1, 0.36, 1) ${p.delay}s forwards`,
            ['--tx' as string]: `${p.tx}px`,
            ['--ty' as string]: `${p.ty}px`,
            ['--rot' as string]: `${p.rot}deg`,
            transformOrigin: 'center',
          }}
        />
      ))}
    </div>
  );
}

function PremiumVisual({
  playOnce,
  celebrationGifSrc,
}: {
  playOnce: boolean;
  celebrationGifSrc?: string;
}) {
  if (playOnce && celebrationGifSrc) {
    return (
      <div className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border md:h-[100px] md:w-[100px]" style={{ borderColor: `${R}28` }}>
        <Image
          src={celebrationGifSrc}
          alt=""
          width={100}
          height={100}
          className="h-full w-full object-cover"
          unoptimized
          priority
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center md:h-[100px] md:w-[100px]">
      <div
        className={`absolute inset-0 rounded-2xl ${playOnce ? 'sub-hero-glow-pulse' : ''}`}
        style={{
          background: `linear-gradient(135deg, ${R}22, ${B}18)`,
        }}
      />

      <svg
        viewBox="0 0 100 100"
        className={`relative z-[1] h-[72px] w-[72px] md:h-20 md:w-20 ${playOnce ? 'sub-hero-badge-pop' : ''}`}
        aria-hidden
      >
        <defs>
          <linearGradient id="subHeroRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={R} />
            <stop offset="50%" stopColor={O} />
            <stop offset="100%" stopColor={B} />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="url(#subHeroRing)"
          strokeWidth="3"
          className={playOnce ? 'sub-hero-stroke-draw' : ''}
          style={{
            strokeDasharray: 276,
            strokeDashoffset: playOnce ? 276 : 0,
          }}
        />
        <path
          d="M32 52 L45 65 L70 38"
          fill="none"
          stroke="url(#subHeroRing)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={playOnce ? 'sub-hero-check-draw' : ''}
          style={{
            strokeDasharray: 60,
            strokeDashoffset: playOnce ? 60 : 0,
          }}
        />
      </svg>
      {playOnce && (
        <Sparkles
          className="absolute -right-1 -top-1 h-5 w-5 text-amber-400 sub-hero-sparkle opacity-0"
          strokeWidth={1.75}
          aria-hidden
        />
      )}
    </div>
  );
}

export function SubscriptionStatusHero({
  loading,
  isPremium,
  isTrialActive,
  trialUrgent,
  trialDaysRemaining,
  subscription,
  plans,
  onCheckout,
  celebrationGifSrc,
}: Props) {
  const [playIntro, setPlayIntro] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (loading || reducedMotion) {
      setPlayIntro(false);
      return;
    }
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) {
        setPlayIntro(false);
        return;
      }
    } catch {
      setPlayIntro(true);
      return;
    }
    setPlayIntro(true);
    const done = window.setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, '1');
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => window.clearTimeout(done);
  }, [loading, reducedMotion]);

  const periodLabel = formatPeriodEnd(subscription?.currentPeriodEnd);
  const planId = subscription?.plan?.toLowerCase() ?? '';
  const planMeta = plans.find((p) => p.id === planId);

  if (loading) return null;

  const borderStyle = isPremium
    ? 'rgba(228,20,20,0.22)'
    : isTrialActive
      ? trialUrgent
        ? 'rgba(245,158,11,0.3)'
        : 'rgba(245,158,11,0.22)'
      : 'var(--border)';

  const bgStyle = isPremium
    ? `linear-gradient(135deg, rgba(228,20,20,0.07), rgba(248,118,0,0.06), rgba(0,172,248,0.04)), var(--card)`
    : isTrialActive
      ? trialUrgent
        ? 'rgba(245,158,11,0.05)'
        : 'rgba(245,158,11,0.04)'
      : 'var(--card)';

  const showConfetti = playIntro && isPremium && !reducedMotion;

  return (
    <div
      className={`relative mb-10 overflow-hidden rounded-2xl border p-5 md:p-6 ${
        playIntro && !reducedMotion ? 'sub-hero-card-enter' : ''
      }`}
      style={{
        borderColor: borderStyle,
        background: bgStyle,
        boxShadow: isPremium
          ? '0 12px 40px rgba(228,20,20,0.07), 0 2px 8px rgba(0,0,0,0.04)'
          : undefined,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.65]"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)`,
          backgroundSize: '18px 18px',
        }}
      />
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 h-[3px] rounded-t-2xl"
        style={{
          background: `linear-gradient(90deg, ${R}, ${O}, ${B})`,
          opacity: isPremium ? 1 : 0.55,
        }}
      />

      <ConfettiBurst active={showConfetti} />

      <div className="relative z-[1] flex flex-wrap items-center gap-5 md:gap-6">
        {isPremium ? (
          <PremiumVisual
            playOnce={playIntro && !reducedMotion}
            celebrationGifSrc={celebrationGifSrc}
          />
        ) : (
          <div
            className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-2xl border text-3xl md:h-[100px] md:w-[100px]"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--muted)',
            }}
            aria-hidden
          >
            {isTrialActive ? '⏳' : '🗓️'}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {isPremium && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: `linear-gradient(135deg, ${R}18, ${B}12)`,
                  color: R,
                  border: `1px solid ${R}30`,
                }}
              >
                <Crown size={11} strokeWidth={2} />
                Suscripción activa
              </span>
            )}
          </div>

          {isPremium ? (
            <>
              <p className="mb-0 font-headline text-[17px] font-bold leading-snug tracking-tight md:text-[18px]">
                Plan <span className="gradient-text capitalize">{subscription?.plan ?? '—'}</span>
              </p>
              {planMeta ? (
                <p className="m-0 text-[12px] font-semibold" style={{ color: 'var(--muted-foreground)' }}>
                  {planMeta.name} · {planMeta.price}
                  {planMeta.priceSuffix}
                </p>
              ) : null}
              <p className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                Tienes acceso completo a widgets, agentes y límites según tu plan. La facturación se gestiona de forma
                segura con Stripe.
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-[12px]">
                {periodLabel && (
                  <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
                    <ShieldCheck size={14} className="shrink-0" style={{ color: B }} strokeWidth={2} />
                    <span>
                      {subscription?.cancelAtPeriodEnd
                        ? `Acceso hasta el ${periodLabel} (cancelación programada)`
                        : `Próxima renovación: ${periodLabel}`}
                    </span>
                  </span>
                )}
                <Link
                  href="/dashboard/settings"
                  className="landing-link-accent inline-flex items-center gap-1 text-[12px] font-semibold"
                >
                  Facturación y plan →
                </Link>
              </div>
            </>
          ) : isTrialActive ? (
            <>
              <p
                className="mb-0 text-[15px] font-bold leading-snug"
                style={{ color: trialUrgent ? '#d97706' : 'var(--foreground)' }}
              >
                {trialDaysRemaining === 0
                  ? 'Último día de prueba'
                  : `Prueba gratuita · ${trialDaysRemaining} día${trialDaysRemaining !== 1 ? 's' : ''} restante${trialDaysRemaining !== 1 ? 's' : ''}`}
              </p>
              <p className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                {trialUrgent
                  ? 'Tu prueba está próxima a vencer. Elige un plan para continuar sin interrupciones.'
                  : 'Estás en el período de prueba gratuita de 3 días. Explora todas las funciones.'}
              </p>
            </>
          ) : (
            <>
              <p className="mb-0 text-[15px] font-semibold" style={{ color: 'var(--foreground)' }}>Período de prueba finalizado</p>
              <p className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                Tu prueba ha concluido. Elige un plan para seguir usando la plataforma.
              </p>
            </>
          )}
        </div>

        {!isPremium && (
          <div className="flex w-full flex-wrap gap-2 md:ml-auto md:w-auto md:justify-end">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => onCheckout(plan.id)}
                className="cursor-pointer rounded-xl border-0 px-4 py-2 text-xs font-bold text-white shadow-md transition-transform hover:scale-[1.02]"
                style={{
                  background: plan.popular ? `linear-gradient(135deg, ${R}, ${O})` : plan.color,
                  boxShadow: plan.popular ? '0 4px 16px rgba(228,20,20,0.25)' : undefined,
                }}
              >
                {plan.name} {plan.price}
                {plan.priceSuffix}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
