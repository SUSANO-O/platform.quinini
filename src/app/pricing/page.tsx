import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import { PLANS, buildPricingGridPlans } from '@/lib/gateway';
import { PLAN_DISPLAY, CONVERSATION_PACKS, API_REST_COMING_SOON_LABEL } from '@/lib/plan-catalog';
import { Check, ArrowRight, Zap, Gift, Rocket, Smartphone, Wallet, Landmark, type LucideIcon } from 'lucide-react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PricingComparisonTable } from '@/components/landing/pricing-comparison-table';
import { PricingPlanCard } from '@/components/landing/pricing-plan-card';
import Link from 'next/link';

import { buildPlanWhatsAppUrl } from '@/lib/sales-whatsapp';

/** Métodos de pago aceptados (pago coordinado por WhatsApp). Si existe el SVG oficial
 *  en /public/payment/<slug>.svg se muestra el logo; si no, badge de color con icono. */
const PAYMENT_METHODS: { name: string; slug: string; bg: string; Icon: LucideIcon }[] = [
 // { name: 'Nequi', slug: 'nequi', bg: '#DA0081', Icon: Smartphone },     // billetera móvil
 // { name: 'Daviplata', slug: 'daviplata', bg: '#E1251B', Icon: Wallet }, // billetera móvil
 // { name: 'PSE', slug: 'pse', bg: '#1D5BA4', Icon: Landmark },           // transferencia bancaria
  { name: 'Bre-B', slug: 'bre-b', bg: '#0FB5BA', Icon: Zap },            // pago inmediato
];

/** Logo oficial en public/payment/<slug>.(svg|png|webp). Devuelve la ruta pública o null. */
function paymentLogo(slug: string): string | null {
  for (const ext of ['svg', 'png', 'webp', 'jpg', 'jpeg']) {
    if (existsSync(join(process.cwd(), 'public', 'payment', `${slug}.${ext}`))) {
      return `/payment/${slug}.${ext}`;
    }
  }
  return null;
}

function planWhatsAppUrl(planName: string, priceLabel?: string) {
  return buildPlanWhatsAppUrl(planName, priceLabel);
}

const FREE_PLAN       = PLANS.find((p) => p.id === 'free');
const PAID_PLANS      = buildPricingGridPlans();
const SOLO_PLAN       = PLANS.find((p) => p.id === 'solo');
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

      <section className="relative pt-24 sm:pt-28 md:pt-32 pb-16 md:pb-28 px-4 sm:px-6 overflow-hidden">
        <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-200px', left: '8%' }} />
        <div className="hero-glow" style={{ background: 'var(--accent-warm)', top: '-60px', right: '5%' }} />
        <div className="hero-glow" style={{ background: 'var(--accent)', top: '260px', left: '40%' }} />

        <div className="relative max-w-[1400px] mx-auto">

          <div className="text-center mb-10 md:mb-16">
            <div className="badge-primary mb-4 md:mb-6 mx-auto w-fit">Planes</div>
            <h1 className="text-[1.75rem] leading-tight sm:text-4xl md:text-5xl font-extrabold tracking-tight">
              Precios <span className="gradient-text">simples y claros</span>
            </h1>
            <p className="mt-3 md:mt-4 text-base md:text-lg max-w-2xl mx-auto px-1" style={{ color: 'var(--muted-foreground)' }}>
              Empieza gratis y escala según tu volumen. Una métrica principal: conversaciones al mes.
            </p>
          </div>

          {/* Free + Solo entry */}
          <div className="mb-6 md:mb-8 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {FREE_PLAN && (
              <div
                className="rounded-2xl px-5 py-5 md:px-6 md:py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(var(--brand-primary-rgb),0.08)' }}
                  >
                    <Gift size={26} style={{ color: 'var(--primary)' }} />
                  </div>
                  <div>
                    <p className="font-extrabold text-xl md:text-sm m-0">Plan Gratis</p>
                    <p className="text-2xl md:text-sm font-bold m-0 mt-0.5" style={{ color: 'var(--primary)' }}>$0</p>
                    <p className="text-sm md:text-xs mt-1 m-0" style={{ color: 'var(--muted-foreground)' }}>
                      {FREE_PLAN.features[0]}
                    </p>
                  </div>
                </div>
                <Link
                  href="/register"
                  className="shrink-0 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-base md:text-sm font-bold transition-all min-h-[48px]"
                  style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
                >
                  Empezar gratis <ArrowRight size={16} />
                </Link>
              </div>
            )}
            {SOLO_PLAN && (
              <div
                className="rounded-2xl px-5 py-5 md:px-6 md:py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(var(--brand-cool-rgb),0.08)' }}
                  >
                    <Rocket size={26} style={{ color: 'var(--foreground)' }} />
                  </div>
                  <div>
                    <p className="font-extrabold text-xl md:text-sm m-0">Solo</p>
                    <p className="text-2xl md:text-sm font-bold m-0 mt-0.5">{PLAN_DISPLAY.solo.priceLabel}</p>
                    <p className="text-sm md:text-xs mt-1 m-0" style={{ color: 'var(--muted-foreground)' }}>
                      {SOLO_PLAN.features[0]}
                    </p>
                  </div>
                </div>
                <Link
                  href="/register"
                  className="shrink-0 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-base md:text-sm font-bold transition-all min-h-[48px]"
                  style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
                >
                  Probar 7 días <ArrowRight size={16} />
                </Link>
              </div>
            )}
          </div>

          {/* Paid plans — 4 columnas en una fila en desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 items-stretch lg:items-end">
            {PAID_PLANS.map((plan) => (
              <PricingPlanCard
                key={plan.id}
                plan={plan}
                whatsAppHref={planWhatsAppUrl(plan.name, plan.price)}
              />
            ))}
          </div>

          {ENTERPRISE_PLAN && (
            <div
              className="mt-8 rounded-2xl p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
              style={{
                background: 'rgba(var(--brand-primary-rgb),0.04)',
                border: '1px solid rgba(var(--brand-primary-rgb),0.18)',
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
                href={planWhatsAppUrl('Enterprise', 'Contacto')}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all whitespace-nowrap no-underline"
                style={{
                  background: 'var(--brand-primary)',
                  color: '#fff',
                  boxShadow: '0 4px 20px rgba(var(--brand-primary-rgb),0.25)',
                }}
              >
                Contactar asesor
                <ArrowRight size={14} />
              </a>
            </div>
          )}

          {/* Medios de pago aceptados (pago coordinado por WhatsApp; activación manual) */}
          <div className="mt-10 md:mt-12 text-center">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--muted-foreground)' }}>
              Medios de pago aceptados
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
              {PAYMENT_METHODS.map((m) => {
                const logo = paymentLogo(m.slug);
                return logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <span
                    key={m.name}
                    className="inline-flex items-center justify-center px-4 py-2 rounded-xl"
                    style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.10)', height: 44 }}
                  >
                    <img src={logo} alt={m.name} style={{ height: 24, width: 'auto' }} />
                  </span>
                ) : (
                  <span
                    key={m.name}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold no-underline"
                    style={{ background: m.bg, color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
                  >
                    <m.Icon size={16} strokeWidth={2.5} />
                    {m.name}
                  </span>
                );
              })}
            </div>
            <p className="mt-3 text-xs px-2" style={{ color: 'var(--muted-foreground)' }}>
              Coordina tu pago por WhatsApp y activamos tu plan apenas lo confirmes.
            </p>
          </div>

          <div className="mt-16 md:mt-24">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-2 md:mb-3">Comparativa de planes</h2>
            <p className="text-center text-sm mb-2 md:mb-10 px-2" style={{ color: 'var(--muted-foreground)' }}>
              Misma información en todos los canales — conversaciones, agentes, almacenamiento y soporte
            </p>
            <p className="text-center text-xs mb-6 md:hidden px-2" style={{ color: 'var(--muted-foreground)' }}>
              Desliza horizontalmente para ver todos los planes →
            </p>
            <PricingComparisonTable />
          </div>

          <div className="mt-24">
            <h2 className="text-2xl font-bold text-center mb-3">Packs de conversaciones</h2>
            <p className="text-center text-sm mb-10 max-w-xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
              Compra conversaciones extra sin cambiar de plan. Requiere suscripción de pago activa. Válidos 90 días.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
              {CONVERSATION_PACKS.map((pack) => (
                <div
                  key={pack.id}
                  className="rounded-2xl p-6 text-center card-texture"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <p className="text-sm font-bold">{pack.label}</p>
                  <p className="text-3xl font-extrabold mt-2">{pack.priceLabel}</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
                    {pack.conversations.toLocaleString('es')} conversaciones
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    ${(pack.price / pack.conversations * 1000).toFixed(1)} / 1K conv
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-24" id="api">
            <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
              <h2 className="text-2xl font-bold text-center m-0">API REST</h2>
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide"
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#b45309',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                }}
              >
                {API_REST_COMING_SOON_LABEL}
              </span>
            </div>
            <p className="text-center text-sm mb-8 max-w-2xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
              Integra agentes, widgets y conversaciones vía HTTP. Previsto desde el plan <strong>Team</strong> — la
              documentación interactiva y las claves API estarán disponibles en el panel cuando lancemos esta función.
            </p>
            <div
              className="max-w-2xl mx-auto rounded-2xl p-8 card-texture text-center"
              style={{ border: '1px solid var(--border)' }}
            >
              <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
                Endpoints bajo <code className="text-xs">/api/v1</code>: agentes, widgets, conversaciones, claves API
                y auditoría. Autenticación con API key.
              </p>
              <p className="text-xs m-0" style={{ color: 'var(--muted-foreground)' }}>
                Te avisaremos cuando la API esté activa. Mientras tanto, el widget y el panel siguen disponibles en
                todos los planes compatibles.
              </p>
            </div>
          </div>

          <div className="mt-24">
            <h2 className="text-2xl font-bold text-center mb-3">Límites técnicos</h2>
            <p className="text-center text-sm mb-10" style={{ color: 'var(--muted-foreground)' }}>
              Conversaciones mensuales incluidas y rate limit por minuto
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {PLANS.filter((p) => p.id !== 'enterprise' || p.monthlyRequests > 0).map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-2xl p-5 text-center card-texture"
                  style={{
                    background: plan.highlighted ? 'rgba(var(--brand-primary-rgb),0.04)' : undefined,
                    border: plan.highlighted
                      ? '1px solid rgba(var(--brand-primary-rgb),0.22)'
                      : '1px solid var(--border)',
                  }}
                >
                  <p
                    className="text-2xl font-extrabold tabular-nums"
                    style={{ color: plan.highlighted ? 'var(--primary)' : 'var(--foreground)' }}
                  >
                    {plan.monthlyRequests < 0 ? '∞' : fmt(plan.monthlyRequests)}
                    {plan.monthlyRequests >= 0 && (
                      <span className="text-sm font-normal"> conv/mes</span>
                    )}
                  </p>
                  <p className="text-xs font-semibold mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                    {plan.name}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    {plan.rateLimit}/min
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
