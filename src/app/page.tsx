import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import Link from 'next/link';
import {
  Zap, Shield, BarChart3, MessageSquare, Database, FileText,
  ArrowRight, Code2, Globe, Cpu, Layers, Sparkles, Check,
} from 'lucide-react';

const AGENTS = [
  { name: 'Health Monitor', desc: 'Análisis de signos vitales en tiempo real', icon: '🫀', color: '#ef4444' },
  { name: 'Water Quality', desc: 'pH, turbidez, cloro y detección de contaminantes', icon: '💧', color: '#3b82f6' },
  { name: 'Drug Discovery', desc: 'Screening molecular, predicción ADMET', icon: '🧬', color: '#a855f7' },
  { name: 'Smart Agriculture', desc: 'Análisis de suelo, optimización de cultivos', icon: '🌱', color: '#22c55e' },
  { name: 'Education AI', desc: 'Rutas de aprendizaje personalizadas y tutoría', icon: '📚', color: '#f59e0b' },
  { name: 'Plethysmography', desc: 'Análisis de onda, diagnóstico vascular', icon: '📊', color: '#06b6d4' },
  { name: 'Geoeconomics', desc: 'Análisis macroeconómico y riesgo geopolítico', icon: '🌐', color: '#1e40af' },
  { name: 'Cybersecurity', desc: 'Análisis de amenazas, auditoría de vulnerabilidades', icon: '🛡️', color: '#dc2626' },
  { name: 'Maximo', desc: 'Mantenimiento industrial y gestión de activos', icon: '⚙️', color: '#78716c' },
];

const FEATURES = [
  { icon: Zap, title: 'Ultra rápido', desc: 'Tiempos de respuesta sub-200ms. Enrutamiento multi-modelo automático.' },
  { icon: Shield, title: 'Seguro por defecto', desc: 'Auth por API key, rate limiting por plan, datos aislados por tenant.' },
  { icon: Database, title: 'Embeddings & RAG', desc: 'Sube documentos, genera embeddings y obtén respuestas ancladas en tus datos.' },
  { icon: MessageSquare, title: 'Widget SDK', desc: 'Embebe un chat widget en cualquier sitio web con una sola línea de código.' },
  { icon: BarChart3, title: 'Analytics en tiempo real', desc: 'Dashboard con requests, latencia, endpoints top y costos.' },
  { icon: Globe, title: 'Multi-tenant', desc: 'Cada API key tiene datos aislados, rate limits independientes y facturación separada.' },
];

const PLANS = [
  {
    name: 'Starter',
    price: '$19',
    period: '/mes',
    widgets: '3 widgets',
    requests: '50,000 req/mes',
    features: ['3 widgets activos', '50k requests/mes', 'Chat SDK', 'Analítica básica', 'Soporte por email'],
    color: '#0d9488',
    cta: 'Empezar gratis',
    id: 'starter',
  },
  {
    name: 'Growth',
    price: '$49',
    period: '/mes',
    widgets: '6 widgets',
    requests: '200,000 req/mes',
    features: ['6 widgets activos', '200k requests/mes', 'Chat SDK + RAG', 'Analítica avanzada', 'Soporte prioritario', 'Agentes personalizados'],
    color: '#6366f1',
    cta: 'Empezar gratis',
    id: 'growth',
    popular: true,
  },
  {
    name: 'Business',
    price: '$129',
    period: '/mes',
    widgets: '12 widgets',
    requests: 'Ilimitado',
    features: ['12 widgets activos', 'Requests ilimitados', 'Todas las funciones', 'Soporte dedicado', 'SLA 99.9%', 'Onboarding personalizado'],
    color: '#a855f7',
    cta: 'Empezar gratis',
    id: 'business',
  },
];

const HOW = [
  { step: '01', title: 'Crea tu cuenta', desc: '5 días gratis, sin tarjeta. Acceso completo al Widget Builder y los 9 agentes.' },
  { step: '02', title: 'Diseña tu widget', desc: 'Elige el agente, personaliza colores, textos y posición con el Widget Builder visual.' },
  { step: '03', title: 'Copia el snippet', desc: 'Un bloque de código. Pégalo en tu HTML y el chat aparece al instante.' },
  { step: '04', title: 'Escala cuando estés listo', desc: 'Actualiza al plan que necesites. Sin contratos, cancela cuando quieras.' },
];

export default function LandingPage() {
  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="hero-glow" style={{ background: '#0d9488', top: '-200px', left: '10%' }} />
        <div className="hero-glow" style={{ background: '#6366f1', top: '-100px', right: '5%' }} />
        <div className="hero-glow" style={{ background: '#a855f7', top: '200px', left: '40%' }} />

        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8"
            style={{ background: 'rgba(13,148,136,0.1)', color: '#0d9488', border: '1px solid rgba(13,148,136,0.2)' }}
          >
            <Sparkles size={14} />
            5 días gratis — sin tarjeta de crédito
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1]">
            Agentes de IA para
            <br />
            <span className="gradient-text">cualquier industria</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl max-w-2xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
            Integra un chat widget inteligente en tu sitio web en minutos. 9 agentes especializados,
            una API REST, y un Widget SDK que funciona en cualquier página.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #0d9488, #6366f1)' }}
            >
              Empezar gratis — 5 días de trial <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              Ya tengo cuenta
            </Link>
            <Link
              href="/widget"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              <Code2 size={16} /> Ver SDK docs
            </Link>
          </div>

          {/* Hero code snippet */}
          <div className="mt-16 max-w-2xl mx-auto text-left">
            <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
                <span className="ml-2 text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>tu-sitio.html</span>
              </div>
              <pre className="p-6 text-sm overflow-x-auto" style={{ background: 'var(--card)', color: 'var(--card-foreground)' }}>
                <code>{`<script src="https://hub.agentflowhub.com/widget.js"></script>
<script>
  window.AgentFlowhub.init({
    agentId: "health-monitor",
    token: "afhub_wt_abc123",
    color: "#0d9488",
    position: "bottom-right",
    title: "Mi Asistente IA",
  });
</script>`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">Funciona en 4 pasos</h2>
            <p className="mt-4" style={{ color: 'var(--muted-foreground)' }}>
              De cero a un chat widget en tu sitio en menos de 10 minutos.
            </p>
          </div>
          <div className="space-y-8">
            {HOW.map((s, i) => (
              <div key={s.step} className="flex gap-6 items-start">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-lg shrink-0"
                  style={{
                    background: i === 0 ? 'linear-gradient(135deg, #0d9488, #6366f1)' : 'var(--card)',
                    color: i === 0 ? '#fff' : 'var(--muted-foreground)',
                    border: i !== 0 ? '1px solid var(--border)' : undefined,
                  }}
                >
                  {s.step}
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1">{s.title}</h3>
                  <p style={{ color: 'var(--muted-foreground)' }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AGENTS ───────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              <span className="gradient-text">9 Agentes especializados</span>
            </h2>
            <p className="mt-4 text-lg" style={{ color: 'var(--muted-foreground)' }}>
              Cada agente está entrenado para su dominio. Elige uno, envía datos, recibe insights.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {AGENTS.map((a) => (
              <div
                key={a.name}
                className="rounded-2xl p-6 transition-all hover:shadow-lg hover:-translate-y-1"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="text-3xl mb-3">{a.icon}</div>
                <h3 className="text-lg font-bold mb-1">{a.name}</h3>
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">Todo lo que necesitas para integrar IA</h2>
            <p className="mt-4 text-lg" style={{ color: 'var(--muted-foreground)' }}>
              Desde embeddings hasta facturación — manejamos la infraestructura para que te enfoques en tu producto.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl p-7 transition-all hover:shadow-md"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(13,148,136,0.1)' }}>
                  <f.icon size={20} style={{ color: '#0d9488' }} />
                </div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WIDGET BUILDER PREVIEW ──────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">Widget Builder visual</h2>
            <p className="mt-4" style={{ color: 'var(--muted-foreground)' }}>
              Diseña tu chat widget con preview en tiempo real. Sin código hasta que estés listo.
            </p>
          </div>
          <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
              <span className="ml-2 text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>AgentFlow — Widget Builder</span>
              <Link href="/register" className="ml-auto text-xs font-semibold" style={{ color: '#0d9488' }}>
                Abrir →
              </Link>
            </div>
            <div className="p-6" style={{ background: 'var(--card)' }}>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-semibold mb-3" style={{ color: 'var(--muted-foreground)' }}>Configuración</p>
                  {['Agente', 'Color de marca', 'Título', 'Posición', 'Tema'].map((f) => (
                    <div key={f} className="flex items-center gap-3 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: '#0d9488' }} />
                      <span className="text-sm">{f}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-sm font-semibold mb-3" style={{ color: 'var(--muted-foreground)' }}>Vista previa en tiempo real</p>
                  <div className="rounded-xl overflow-hidden" style={{ background: '#f8fafc', border: '1px solid var(--border)', height: '120px', position: 'relative' }}>
                    <div style={{ position: 'absolute', bottom: 12, right: 12, width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(148deg, #14b8a6 0%, #0d9488 46%, #0a7a6f 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 4px 12px #0d948866' }}>
                      💬
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">Precios transparentes</h2>
            <p className="mt-4" style={{ color: 'var(--muted-foreground)' }}>
              5 días de prueba gratuita en todos los planes. Sin contratos. Cancela cuando quieras.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl p-7 relative"
                style={{
                  background: plan.popular ? `linear-gradient(135deg, rgba(99,102,241,0.06), rgba(168,85,247,0.06))` : 'var(--card)',
                  border: `1px solid ${plan.popular ? plan.color : 'var(--border)'}`,
                }}
              >
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
                    background: `linear-gradient(135deg, ${plan.color}, #a855f7)`,
                    color: '#fff', fontSize: '11px', fontWeight: 700, padding: '4px 14px', borderRadius: '20px',
                    whiteSpace: 'nowrap',
                  }}>
                    Más popular
                  </div>
                )}

                <h3 className="text-xl font-extrabold mb-1">{plan.name}</h3>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-extrabold" style={{ color: plan.color }}>{plan.price}</span>
                  <span className="text-sm pb-1" style={{ color: 'var(--muted-foreground)' }}>{plan.period}</span>
                </div>
                <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>{plan.widgets} · {plan.requests}</p>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2 text-sm">
                      <Check size={14} style={{ color: plan.color, flexShrink: 0 }} />
                      {feat}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className="block text-center py-3 rounded-xl font-bold text-sm transition-all hover:shadow-lg"
                  style={{
                    background: plan.popular ? `linear-gradient(135deg, ${plan.color}, #a855f7)` : plan.color,
                    color: '#fff',
                  }}
                >
                  {plan.cta} — 5 días gratis
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Preguntas frecuentes</h2>
          {[
            { q: '¿Qué incluye el trial de 5 días?', a: 'Acceso completo al Widget Builder, todos los agentes y el SDK. Sin límites en el período de prueba.' },
            { q: '¿Necesito tarjeta de crédito para registrarme?', a: 'No. Solo email y contraseña. La tarjeta solo se solicita cuando eliges un plan de pago.' },
            { q: '¿Puedo cancelar en cualquier momento?', a: 'Sí. Sin contratos ni penalizaciones. Cancelas y el acceso continúa hasta el fin del período pagado.' },
            { q: '¿El widget funciona en cualquier sitio web?', a: 'Sí. Cualquier página HTML. Solo necesitas incluir el script y llamar a window.AgentFlowhub.init().' },
            { q: '¿Qué pasa si supero el límite de requests?', a: 'Te notificamos antes de llegar al límite. Puedes actualizar tu plan o esperar el próximo ciclo.' },
          ].map((faq) => (
            <details key={faq.q} className="mb-4 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <summary className="px-6 py-4 font-semibold cursor-pointer text-sm" style={{ listStyle: 'none' }}>
                {faq.q}
              </summary>
              <p className="px-6 pb-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 text-center relative overflow-hidden" style={{ background: 'var(--muted)' }}>
        <div className="hero-glow" style={{ background: '#0d9488', bottom: '-200px', left: '20%' }} />
        <div className="hero-glow" style={{ background: '#6366f1', bottom: '-100px', right: '20%' }} />

        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-6">
            Empieza hoy.<br />
            <span className="gradient-text">5 días gratis.</span>
          </h2>
          <p className="text-lg mb-10" style={{ color: 'var(--muted-foreground)' }}>
            Sin tarjeta. Cancela cuando quieras. Tu primer widget activo en minutos.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-semibold transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #0d9488, #6366f1)' }}
            >
              Crear cuenta gratis <ArrowRight size={18} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
