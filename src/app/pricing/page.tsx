import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import { PLANS } from '@/lib/gateway';
import { Check, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function PricingPage() {
  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      <section className="pt-32 pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-extrabold">
              Simple, <span className="gradient-text">transparent</span> pricing
            </h1>
            <p className="mt-4 text-lg" style={{ color: 'var(--muted-foreground)' }}>
              Start free. Scale as you grow. No hidden fees.
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
                    ? '2px solid #0d9488'
                    : '1px solid var(--border)',
                  boxShadow: plan.highlighted ? '0 0 40px rgba(13,148,136,0.1)' : undefined,
                }}
              >
                {plan.highlighted && (
                  <div
                    className="text-xs font-bold uppercase tracking-widest mb-4 px-3 py-1 rounded-full self-start"
                    style={{ background: 'rgba(13,148,136,0.1)', color: '#0d9488' }}
                  >
                    Most Popular
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
                      <Check size={16} className="mt-0.5 shrink-0" style={{ color: '#0d9488' }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/dashboard"
                  className="mt-8 flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all"
                  style={
                    plan.highlighted
                      ? { background: 'linear-gradient(135deg, #0d9488, #6366f1)', color: '#fff' }
                      : { border: '1px solid var(--border)', color: 'var(--foreground)' }
                  }
                >
                  {plan.id === 'free' ? 'Start Free' : plan.id === 'enterprise' ? 'Contact Sales' : 'Start 15-day Trial'}
                  <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>

          {/* FAQ / rate limits */}
          <div className="mt-24 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-10">Rate Limits by Plan</h2>
            <div className="grid grid-cols-3 gap-4">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-2xl p-6 text-center"
                  style={{
                    background: plan.highlighted ? 'rgba(13,148,136,0.05)' : 'var(--card)',
                    border: plan.highlighted ? '1px solid rgba(13,148,136,0.2)' : '1px solid var(--border)',
                  }}
                >
                  <p className="text-3xl font-extrabold" style={{ color: plan.highlighted ? '#0d9488' : 'var(--foreground)' }}>
                    {plan.rateLimit}/min
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{plan.name}</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
                    {plan.monthlyRequests.toLocaleString()} req/month
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
