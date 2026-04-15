import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import { PLANS } from '@/lib/gateway';
import { Check, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function PricingPage() {
  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-200px', left: '8%' }} />
        <div className="hero-glow" style={{ background: 'var(--accent-warm)', top: '-60px', right: '5%' }} />
        <div className="hero-glow" style={{ background: 'var(--accent)', top: '200px', left: '40%' }} />

        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="badge-primary mb-6 mx-auto w-fit">Planes</div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Precios <span className="gradient-text">simples y claros</span>
            </h1>
            <p className="mt-4 text-lg max-w-2xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
              Empieza gratis y escala según tu volumen. Sin letras pequeñas — alineado con el resto del sitio.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className="rounded-2xl p-8 flex flex-col transition-all hover:shadow-lg"
                style={{
                  background: 'var(--card)',
                  border: plan.highlighted
                    ? '2px solid var(--primary)'
                    : '1px solid var(--border)',
                  boxShadow: plan.highlighted ? '0 8px 32px rgba(228,20,20,0.12)' : undefined,
                }}
              >
                {plan.highlighted && (
                  <div
                    className="text-xs font-bold uppercase tracking-widest mb-4 px-3 py-1 rounded-full self-start"
                    style={{
                      background: 'linear-gradient(135deg, rgba(228,20,20,0.12), rgba(248,118,0,0.12))',
                      color: 'var(--primary)',
                      border: '1px solid rgba(228,20,20,0.2)',
                    }}
                  >
                    Más popular
                  </div>
                )}

                <h3 className="text-xl font-bold">{plan.name}</h3>

                <div className="mt-4 mb-6">
                  <span className="text-5xl font-extrabold">{plan.price}</span>
                  {plan.priceNote && (
                    <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{plan.priceNote}</span>
                  )}
                </div>

                <ul className="space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={16} className="mt-0.5 shrink-0" style={{ color: plan.highlighted ? 'var(--primary)' : 'var(--accent)' }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/dashboard"
                  className="mt-8 flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all"
                  style={
                    plan.highlighted
                      ? {
                          background: 'linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))',
                          color: '#fff',
                          boxShadow: '0 4px 20px rgba(228,20,20,0.25)',
                        }
                      : { border: '1px solid var(--border)', color: 'var(--foreground)' }
                  }
                >
                  {plan.id === 'free' ? 'Empezar gratis' : plan.id === 'enterprise' ? 'Contactar ventas' : 'Probar 15 días'}
                  <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>

          {/* FAQ / rate limits */}
          <div className="mt-24 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-10">Límites por plan</h2>
            <div className="grid grid-cols-3 gap-4">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-2xl p-6 text-center card-texture"
                  style={{
                    background: plan.highlighted ? 'rgba(228,20,20,0.04)' : undefined,
                    border: plan.highlighted ? '1px solid rgba(228,20,20,0.22)' : '1px solid var(--border)',
                  }}
                >
                  <p
                    className="text-3xl font-extrabold"
                    style={{ color: plan.highlighted ? 'var(--primary)' : 'var(--foreground)' }}
                  >
                    {plan.rateLimit}/min
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{plan.name}</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
                    {plan.monthlyRequests.toLocaleString()} req/mes
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
