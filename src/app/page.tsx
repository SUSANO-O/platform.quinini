import React from 'react';
import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import Link from 'next/link';
import {
  Zap, Shield, BarChart3, MessageSquare, Database,
  ArrowRight, Code2, Globe, Sparkles, Check,
  HeartPulse, Droplets, FlaskConical, Sprout,
  GraduationCap, Activity, TrendingUp, Lock, Wrench,
} from 'lucide-react';

/* ── Paleta #e41414 ───────────────────────────────────────────────────────── */
const R  = '#e41414';  // rojo principal
const O  = '#f87600';  // naranja análogo
const B  = '#00acf8';  // azul complementario
const C  = '#00f8e5';  // cyan split-complement
const Rd = '#bb1b14';  // rojo oscuro

const AGENTS: { name: string; desc: string; Icon: React.ElementType; color: string }[] = [
  { name: 'Health Monitor',    desc: 'Análisis de signos vitales en tiempo real',           Icon: HeartPulse,    color: R  },
  { name: 'Water Quality',     desc: 'pH, turbidez, cloro y detección de contaminantes',    Icon: Droplets,      color: B  },
  { name: 'Drug Discovery',    desc: 'Screening molecular, predicción ADMET',               Icon: FlaskConical,  color: O  },
  { name: 'Smart Agriculture', desc: 'Análisis de suelo, optimización de cultivos',         Icon: Sprout,        color: C  },
  { name: 'Education AI',      desc: 'Rutas de aprendizaje personalizadas y tutoría',       Icon: GraduationCap, color: O  },
  { name: 'Plethysmography',   desc: 'Análisis de onda, diagnóstico vascular',              Icon: Activity,      color: B  },
  { name: 'Geoeconomics',      desc: 'Análisis macroeconómico y riesgo geopolítico',        Icon: TrendingUp,    color: B  },
  { name: 'Cybersecurity',     desc: 'Análisis de amenazas, auditoría de vulnerabilidades', Icon: Lock,          color: R  },
  { name: 'Maximo',            desc: 'Mantenimiento industrial y gestión de activos',       Icon: Wrench,        color: Rd },
];

const FEATURES = [
  { icon: Zap,          title: 'Ultra rápido',             desc: 'Tiempos de respuesta sub-200 ms. Enrutamiento multi-modelo automático.',           color: R },
  { icon: Shield,       title: 'Seguro por defecto',       desc: 'Auth por API key, rate limiting por plan, datos aislados por tenant.',              color: Rd },
  { icon: Database,     title: 'Embeddings & RAG',         desc: 'Sube documentos, genera embeddings y obtén respuestas ancladas en tus datos.',      color: O },
  { icon: MessageSquare,title: 'Widget API',               desc: 'Embebe un chat widget en cualquier sitio web con una sola línea de código.',        color: B },
  { icon: BarChart3,    title: 'Analytics en tiempo real', desc: 'Dashboard con requests, latencia, endpoints top y costos.',                         color: C },
  { icon: Globe,        title: 'Multi-tenant',             desc: 'Cada API key tiene datos aislados, rate limits independientes y facturación separada.', color: B },
];

const PLANS = [
  {
    name: 'Starter', price: '$29', period: '/mes',
    widgets: '2 widgets', requests: '5,000 conv/mes',
    features: [
      '2 widgets activos en tu sitio',
      '5.000 conversaciones al mes (~167/día)',
      '1 agente personalizado',
      'Chat AI + analítica básica',
      'Soporte por email (48 h)',
    ],
    color: B, id: 'starter',
  },
  {
    name: 'Growth', price: '$79', period: '/mes',
    widgets: '5 widgets', requests: '25,000 conv/mes',
    features: [
      '5 widgets activos en tu sitio',
      '25.000 conversaciones al mes (~833/día)',
      'Agentes ilimitados + RAG',
      'Analítica avanzada + exportación CSV',
      'Soporte prioritario (chat, 24 h)',
    ],
    color: R, id: 'growth', popular: true,
  },
  {
    name: 'Business', price: '$199', period: '/mes',
    widgets: '15 widgets', requests: '100k conv/mes',
    features: [
      '15 widgets activos en tu sitio',
      '100.000 conversaciones al mes (~3.300/día)',
      'Agentes + RAG + integraciones MCP',
      'Soporte dedicado + SLA 99,9 %',
      'Onboarding y configuración incluidos',
    ],
    color: O, id: 'business',
  },
];

const HOW = [
  { step: '01', title: 'Crea tu cuenta',           desc: '5 días gratis, sin tarjeta. Acceso completo al Widget Builder y los 9 agentes.' },
  { step: '02', title: 'Diseña tu widget',          desc: 'Elige el agente, personaliza colores, textos y posición con el Widget Builder visual.' },
  { step: '03', title: 'Copia el snippet',          desc: 'Un bloque de código. Pégalo en tu HTML y el chat aparece al instante.' },
  { step: '04', title: 'Escala cuando estés listo', desc: 'Actualiza al plan que necesites. Sin contratos, cancela cuando quieras.' },
];

export default function LandingPage() {
  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)', position: 'relative' }}>
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-24 overflow-hidden">
        <div className="hero-glow" style={{ background: R, top: '-180px', left: '8%' }} />
        <div className="hero-glow" style={{ background: O, top: '-80px',  right: '4%' }} />
        <div className="hero-glow" style={{ background: B, top: '220px',  left: '42%' }} />

        <div className="relative max-w-5xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="badge-primary mb-8 mx-auto w-fit">
            <Sparkles size={13} />
            5 días gratis — sin tarjeta de crédito
          </div>

          <h1
            style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 700, letterSpacing: '-0.03em' }}
            className="text-5xl md:text-7xl leading-[1.05]"
          >
            Agentes de IA para
            <br />
            <span className="gradient-text">cualquier industria</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl max-w-2xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
            Crea tu propio chat widget inteligente en tu sitio web en minutos. Crea agentes especializados,
            una API REST FULL , y Widgets API que funciona en cualquier página todo en un solo lugar.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.03]"
              style={{ background: `linear-gradient(135deg, ${R}, ${O})`, boxShadow: `0 4px 20px rgba(228,20,20,0.28)` }}
            >
              Empezar gratis — 5 días de trial <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:bg-slate-50"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              Ya tengo cuenta
            </Link>
            <Link
              href="/widget"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:bg-slate-50"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              <Code2 size={16} /> Ver docs
            </Link>
          </div>

          {/* Stats counters */}
          <div className="mt-16 max-w-3xl mx-auto">
            <div className="grid grid-cols-3 gap-6">
              {[
                { value: '1,200+', label: 'Agentes creados',          gradient: `linear-gradient(135deg,${R},${O})` },
                { value: '4,800+', label: 'Conversaciones al día',    gradient: `linear-gradient(135deg,${O},${B})` },
                { value: '320+',   label: 'Empresas que confían en nosotros', gradient: `linear-gradient(135deg,${B},${C})` },
              ].map(({ value, label, gradient }) => (
                <div
                  key={label}
                  className="card-texture rounded-2xl p-6 flex flex-col items-center gap-2 text-center"
                  style={{ border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}
                >
                  <span
                    className="text-4xl md:text-5xl font-extrabold"
                    style={{ background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                  >
                    {value}
                  </span>
                  <span className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
                </div>
              ))}
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
          <div className="space-y-4">
            {HOW.map((s, i) => {
              const stepColors = [`linear-gradient(135deg,${R},${O})`, `linear-gradient(135deg,${O},${B})`, `linear-gradient(135deg,${B},${C})`, `linear-gradient(135deg,${C},${R})`];
              return (
                <div key={s.step} className="card-texture flex gap-6 items-start p-6 rounded-2xl" style={{ border: '1px solid var(--border)' }}>
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-lg shrink-0 text-white"
                    style={{ background: stepColors[i] }}
                  >
                    {s.step}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">{s.title}</h3>
                    <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{s.desc}</p>
                  </div>
                </div>
              );
            })}
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
                className="card-hover rounded-2xl overflow-hidden"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                {/* Barra superior con micro-gradiente */}
                <div style={{ height: 3, background: `linear-gradient(90deg, ${a.color}, ${a.color}88)` }} />

                <div className="p-6">
                  {/* Icono en contenedor con fondo de color suave */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{
                      background: `${a.color}12`,
                      border: `1px solid ${a.color}28`,
                    }}
                  >
                    <a.Icon size={22} style={{ color: a.color }} strokeWidth={1.75} />
                  </div>

                  <h3 className="text-base font-bold mb-1.5" style={{ letterSpacing: '-0.01em' }}>{a.name}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{a.desc}</p>
                </div>
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
                className="card-hover rounded-2xl overflow-hidden"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div style={{ height: 3, background: `linear-gradient(90deg, ${f.color}, ${f.color}88)` }} />
                <div className="p-7">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${f.color}12`, border: `1px solid ${f.color}28` }}
                  >
                    <f.icon size={20} style={{ color: f.color }} strokeWidth={1.75} />
                  </div>
                  <h3 className="text-base font-bold mb-2" style={{ letterSpacing: '-0.01em' }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WIDGET BUILDER PREVIEW ──────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4" style={{ background: `rgba(228,20,20,0.08)`, color: R }}>
              Convierte más, sin esfuerzo
            </span>
            <h2 className="text-3xl md:text-4xl font-bold">Tu agente de ventas que nunca duerme</h2>
            <p className="mt-4 max-w-xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
              Despliega un chat inteligente en tu sitio en menos de 5 minutos. Responde dudas, califica leads y cierra ventas — las 24 horas.
            </p>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', boxShadow: `0 16px 60px rgba(228,20,20,0.10)` }}>
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
              <span className="ml-2 text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>MatIAs — Widget Builder</span>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: '#22c55e' }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#22c55e' }} />
                  En vivo
                </span>
                <Link href="/register" className="text-xs font-bold px-3 py-1 rounded-lg text-white" style={{ background: `linear-gradient(135deg,${R},${O})` }}>
                  Empezar gratis →
                </Link>
              </div>
            </div>

            <div className="p-6 md:p-8" style={{ background: 'var(--card)' }}>
              <div className="grid md:grid-cols-2 gap-8 items-start">

                {/* Left — benefits */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: 'var(--muted-foreground)' }}>Por qué los equipos de ventas lo eligen</p>
                  {[
                    { color: R,  title: 'Responde al instante',       desc: 'Sin tiempos de espera. El cliente recibe respuesta en menos de 1 segundo.' },
                    { color: O,  title: 'Califica leads automáticamente', desc: 'El agente identifica intención de compra y prioriza contactos calientes.' },
                    { color: B,  title: 'Se integra en 2 líneas',     desc: 'Un script y ya. Compatible con cualquier web, CMS o ecommerce.' },
                    { color: C,  title: 'Tu marca, tu estilo',        desc: 'Colores, logo, posición y tono completamente personalizables.' },
                    { color: Rd, title: 'Analítica de conversiones',  desc: 'Mide aperturas, mensajes y leads generados desde el dashboard.' },
                  ].map(({ color, title, desc }) => (
                    <div key={title} className="flex items-start gap-3 mb-4">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${color}20` }}>
                        <Check size={11} style={{ color }} strokeWidth={3} />
                      </div>
                      <div>
                        <span className="text-sm font-semibold">{title}</span>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right — live chat preview */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: 'var(--muted-foreground)' }}>Conversación real de muestra</p>
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {/* Chat header */}
                    <div className="flex items-center gap-3 px-4 py-3" style={{ background: `linear-gradient(135deg,${R},${O})` }}>
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">M</div>
                      <div>
                        <p className="text-xs font-bold text-white">Asistente MatIAs</p>
                        <p className="text-xs text-white/70 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-300 inline-block" />
                          Disponible ahora
                        </p>
                      </div>
                    </div>
                    {/* Messages */}
                    <div className="p-4 space-y-3" style={{ background: 'var(--background)', minHeight: 200 }}>
                      <div className="flex gap-2 items-end">
                        <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg,${R},${O})` }}>M</div>
                        <div className="text-xs px-3 py-2 rounded-2xl rounded-bl-none max-w-[80%]" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                          ¡Hola! 👋 Soy tu asistente. ¿Estás buscando información sobre nuestros planes?
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="text-xs px-3 py-2 rounded-2xl rounded-br-none max-w-[75%] text-white" style={{ background: `linear-gradient(135deg,${R},${O})` }}>
                          Sí, ¿qué incluye el plan Pro?
                        </div>
                      </div>
                      <div className="flex gap-2 items-end">
                        <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg,${R},${O})` }}>M</div>
                        <div className="text-xs px-3 py-2 rounded-2xl rounded-bl-none max-w-[80%]" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                          El plan Pro incluye agentes ilimitados, analítica avanzada y soporte prioritario. Empieza con <strong>5 días gratis</strong> — sin tarjeta. 🚀
                        </div>
                      </div>
                    </div>
                    {/* Input */}
                    <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
                      <div className="flex-1 text-xs px-3 py-1.5 rounded-xl" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>Escribe tu mensaje…</div>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg,${R},${O})` }}>
                        <ArrowRight size={13} className="text-white" />
                      </div>
                    </div>
                  </div>
                  {/* Social proof */}
                  <p className="mt-3 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    <span style={{ color: R, fontWeight: 700 }}>+320 empresas</span> ya usan MatIAs para convertir más visitantes en clientes
                  </p>
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
                  backgroundImage: plan.popular
                    ? `linear-gradient(145deg, rgba(228,20,20,0.04), rgba(248,118,0,0.04)), radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)`
                    : `radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)`,
                  backgroundSize: plan.popular ? 'auto, 20px 20px' : '20px 20px',
                  backgroundColor: 'var(--card)',
                  border: `1px solid ${plan.popular ? plan.color : 'var(--border)'}`,
                  boxShadow: plan.popular ? `0 8px 32px rgba(228,20,20,0.1)` : undefined,
                }}
              >
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
                    background: `linear-gradient(135deg, ${R}, ${O})`,
                    color: '#fff', fontSize: '11px', fontWeight: 700,
                    padding: '4px 16px', borderRadius: '20px', whiteSpace: 'nowrap',
                    letterSpacing: '0.04em',
                  }}>
                    Más popular
                  </div>
                )}

                <h3 className="text-xl font-extrabold mb-1">{plan.name}</h3>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-extrabold" style={{ color: plan.color }}>{plan.price}</span>
                  <span className="text-sm pb-1" style={{ color: 'var(--muted-foreground)' }}>/mes</span>
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
                  className="block text-center py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 hover:shadow-lg text-white"
                  style={{ background: plan.popular ? `linear-gradient(135deg, ${R}, ${O})` : plan.color }}
                >
                  Empezar gratis — 5 días
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
            { q: '¿Qué incluye el trial de 5 días?',               a: 'Acceso completo al Widget Builder, todos los agentes y el SDK. Sin límites en el período de prueba.' },
            { q: '¿Necesito tarjeta de crédito para registrarme?',  a: 'No. Solo email y contraseña. La tarjeta solo se solicita cuando eliges un plan de pago.' },
            { q: '¿Puedo cancelar en cualquier momento?',           a: 'Sí. Sin contratos ni penalizaciones. Cancelas y el acceso continúa hasta el fin del período pagado.' },
            { q: '¿El widget funciona en cualquier sitio web?',     a: 'Sí. Cualquier página HTML. Solo necesitas incluir el script y llamar a window.AgentFlowhub.init().' },
            { q: '¿Qué pasa si supero el límite de requests?',     a: 'Te notificamos antes de llegar al límite. Puedes actualizar tu plan o esperar el próximo ciclo.' },
          ].map((faq) => (
            <details
              key={faq.q}
              className="mb-3 rounded-xl overflow-hidden card-texture"
              style={{ border: '1px solid var(--border)' }}
            >
              <summary className="px-6 py-4 font-semibold cursor-pointer text-sm flex items-center justify-between" style={{ listStyle: 'none' }}>
                {faq.q}
                <span style={{ color: R, fontSize: 18, fontWeight: 300 }}>+</span>
              </summary>
              <p className="px-6 pb-5 text-sm" style={{ color: 'var(--muted-foreground)' }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 text-center relative overflow-hidden" style={{ background: 'var(--muted)' }}>
        <div className="hero-glow" style={{ background: R, bottom: '-220px', left: '15%' }} />
        <div className="hero-glow" style={{ background: O, bottom: '-120px', right: '15%' }} />
        <div className="hero-glow" style={{ background: B, top: '-100px', left: '50%' }} />

        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6">
            Empieza hoy.<br />
            <span className="gradient-text">5 días gratis.</span>
          </h2>
          <p className="text-lg mb-10" style={{ color: 'var(--muted-foreground)' }}>
            Sin tarjeta. Cancela cuando quieras. Tu primer widget activo en minutos.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-semibold transition-all hover:scale-[1.03]"
              style={{ background: `linear-gradient(135deg, ${R}, ${O})`, boxShadow: `0 4px 24px rgba(228,20,20,0.28)` }}
            >
              Crear cuenta gratis <ArrowRight size={18} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm transition-all hover:bg-white"
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
