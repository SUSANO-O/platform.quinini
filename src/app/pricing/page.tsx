import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import { PLANS } from '@/lib/gateway';
import { PLAN_RAG_LIMITS } from '@/lib/plan-catalog';
import { Check, ArrowRight, Zap } from 'lucide-react';
import Link from 'next/link';

const FREE_PLAN       = PLANS.find((p) => p.id === 'free');
const PAID_PLANS      = PLANS.filter((p) => !['free', 'enterprise'].includes(p.id));
const ENTERPRISE_PLAN = PLANS.find((p) => p.id === 'enterprise');

function fmt(n: number) {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${n / 1_000}K`;
  return String(n);
}

export default function PricingPage() {
  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      <section className="relative pt-32 pb-28 px-6 overflow-hidden">
        <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-200px', left: '8%' }} />
        <div className="hero-glow" style={{ background: 'var(--accent-warm)', top: '-60px', right: '5%' }} />
        <div className="hero-glow" style={{ background: 'var(--accent)', top: '260px', left: '40%' }} />

        <div className="relative max-w-6xl mx-auto">

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="text-center mb-16">
            <div className="badge-primary mb-6 mx-auto w-fit">Planes</div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Precios <span className="gradient-text">simples y claros</span>
            </h1>
            <p className="mt-4 text-lg max-w-2xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
              Empieza gratis y escala según tu volumen. Sin letras pequeñas.
            </p>
          </div>

          {/* ── Free plan banner ────────────────────────────────────────────── */}
          {FREE_PLAN && (
            <div
              className="mb-8 rounded-2xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(228,20,20,0.08)' }}
                >
                  <Zap size={18} style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <p className="font-semibold text-sm">Plan Gratis — $0</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {FREE_PLAN.features.join(' · ')}
                  </p>
                </div>
              </div>
              <Link
                href="/register"
                className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                Empezar gratis <ArrowRight size={14} />
              </Link>
            </div>
          )}

          {/* ── Paid plans grid (3 cols) ─────────────────────────────────── */}
          <div className="grid md:grid-cols-3 gap-6 items-end">
            {PAID_PLANS.map((plan) => (
              <div
                key={plan.id}
                className="relative rounded-2xl flex flex-col transition-all hover:shadow-lg"
                style={{
                  background: 'var(--card)',
                  border: plan.highlighted
                    ? '2px solid var(--primary)'
                    : '1px solid var(--border)',
                  boxShadow: plan.highlighted ? '0 12px 48px rgba(228,20,20,0.15)' : undefined,
                  padding: plan.highlighted ? '2.5rem 2rem' : '2rem',
                  marginBottom: plan.highlighted ? undefined : undefined,
                  transform: plan.highlighted ? 'translateY(-8px)' : undefined,
                }}
              >
                {/* Accent bar at top */}
                {plan.highlighted && (
                  <div
                    className="absolute top-0 inset-x-0 h-1 rounded-t-2xl"
                    style={{
                      background: 'linear-gradient(90deg, var(--gradient-start), var(--gradient-mid))',
                    }}
                  />
                )}

                {plan.highlighted && (
                  <div
                    className="text-xs font-bold uppercase tracking-widest mb-5 px-3 py-1 rounded-full self-start"
                    style={{
                      background: 'linear-gradient(135deg, rgba(228,20,20,0.12), rgba(248,118,0,0.12))',
                      color: 'var(--primary)',
                      border: '1px solid rgba(228,20,20,0.2)',
                    }}
                  >
                    ⭐ Más popular
                  </div>
                )}

                <h3 className="text-xl font-bold">{plan.name}</h3>

                <div className="mt-3 mb-6">
                  <span className="text-5xl font-extrabold">{plan.price}</span>
                  {plan.priceNote && (
                    <span className="text-sm ml-1" style={{ color: 'var(--muted-foreground)' }}>
                      {plan.priceNote}
                    </span>
                  )}
                </div>

                <ul className="space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check
                        size={16}
                        className="mt-0.5 shrink-0"
                        style={{ color: plan.highlighted ? 'var(--primary)' : 'var(--accent)' }}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {PLAN_RAG_LIMITS[plan.id] && (
                  <p className="mt-4 text-xs rounded-lg px-3 py-2" style={{
                    color: 'var(--muted-foreground)',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                  }}>
                    RAG: {PLAN_RAG_LIMITS[plan.id]!.mb.toLocaleString()} MB · {PLAN_RAG_LIMITS[plan.id]!.sources} fuentes por agente
                  </p>
                )}

                <Link
                  href="/register"
                  className="mt-8 flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all"
                  style={
                    plan.highlighted
                      ? {
                          background: 'linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))',
                          color: '#fff',
                          boxShadow: '0 4px 20px rgba(228,20,20,0.3)',
                        }
                      : { border: '1px solid var(--border)', color: 'var(--foreground)' }
                  }
                >
                  Probar 7 días gratis
                  <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>

          {/* ── Enterprise section ───────────────────────────────────────── */}
          {ENTERPRISE_PLAN && (
            <div
              className="mt-8 rounded-2xl p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
              style={{
                background: 'linear-gradient(135deg, rgba(228,20,20,0.04), rgba(248,118,0,0.04))',
                border: '1px solid rgba(228,20,20,0.18)',
              }}
            >
              <div className="flex-1">
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-2"
                  style={{ color: 'var(--primary)' }}
                >
                  Enterprise
                </p>
                <h3 className="text-2xl font-bold">Soluciones a medida</h3>
                <p className="mt-2 text-sm max-w-lg" style={{ color: 'var(--muted-foreground)' }}>
                  White-label, volumen empresarial, SLA personalizado y soporte dedicado 24/7.
                </p>
                <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                  {ENTERPRISE_PLAN.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check size={14} style={{ color: 'var(--primary)' }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href="https://wa.me/573196748729"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all whitespace-nowrap"
                style={{
                  background: 'linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))',
                  color: '#fff',
                  boxShadow: '0 4px 20px rgba(228,20,20,0.25)',
                }}
              >
                Contactar asesor
                <ArrowRight size={14} />
              </a>
            </div>
          )}

          {/* ── Rate limits comparison ───────────────────────────────────── */}
          <div className="mt-24">
            <h2 className="text-2xl font-bold text-center mb-3">Límites por plan</h2>
            <p className="text-center text-sm mb-10" style={{ color: 'var(--muted-foreground)' }}>
              Solicitudes por minuto y volumen mensual incluido
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-2xl p-5 text-center card-texture"
                  style={{
                    background: plan.highlighted ? 'rgba(228,20,20,0.04)' : undefined,
                    border: plan.highlighted
                      ? '1px solid rgba(228,20,20,0.22)'
                      : '1px solid var(--border)',
                  }}
                >
                  <p
                    className="text-2xl font-extrabold tabular-nums"
                    style={{ color: plan.highlighted ? 'var(--primary)' : 'var(--foreground)' }}
                  >
                    {plan.rateLimit}
                    <span className="text-sm font-normal">/min</span>
                  </p>
                  <p className="text-xs font-semibold mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                    {plan.name}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    {fmt(plan.monthlyRequests)} req/mes
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  );
}
