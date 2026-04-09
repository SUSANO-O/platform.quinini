import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Code2,
  FlaskConical,
  LayoutDashboard,
  BookOpen,
  Globe2,
  MessageSquareCode,
  Sparkles,
  Cpu,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Demos | AgentFlow',
  description:
    'Prueba la API, el playground, agentes de ejemplo y el panel demo. Todo lo necesario para ver AgentFlow en acción.',
};

type DemoItem = {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
};

const DEMOS: DemoItem[] = [
  {
    title: 'API Playground',
    description:
      'Llama a Agent Farm, modelos, embeddings y health sin escribir curl. Necesitas API key y el gateway en marcha.',
    href: '/playground',
    icon: <FlaskConical className="h-6 w-6" />,
    badge: 'Interactivo',
  },
  {
    title: 'Agente de ejemplo: Geoeconomía',
    description:
      'Página dedicada al agente de análisis macroeconómico y riesgo geopolítico — buen punto de partida para ver el tono y la estructura.',
    href: '/agents/geoeconomics',
    icon: <Globe2 className="h-6 w-6" />,
    badge: 'UI',
  },
  {
    title: 'Dashboard demo',
    description:
      'Flujo tipo producto: claves de API, uso y llamadas de ejemplo (modo demostración con datos simulados donde aplica).',
    href: '/dashboard',
    icon: <LayoutDashboard className="h-6 w-6" />,
  },
  {
    title: 'Documentación',
    description:
      'OpenAPI, autenticación y endpoints del gateway. Ideal para integrar desde tu backend o scripts.',
    href: '/docs',
    icon: <BookOpen className="h-6 w-6" />,
  },
  {
    title: 'Pricing',
    description:
      'Planes Free, Pro y Enterprise con límites de requests y funciones por nivel.',
    href: '/pricing',
    icon: <Cpu className="h-6 w-6" />,
  },
];

export default function DemosPage() {
  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 px-6 overflow-hidden">
        <div className="hero-glow" style={{ background: '#0d9488', top: '-180px', left: '8%' }} />
        <div className="hero-glow" style={{ background: '#6366f1', top: '-80px', right: '0%' }} />

        <div className="relative max-w-4xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8"
            style={{
              background: 'rgba(99,102,241,0.1)',
              color: '#6366f1',
              border: '1px solid rgba(99,102,241,0.2)',
            }}
          >
            <Sparkles size={14} />
            Demos y entornos de prueba
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.1]">
            Landing de{' '}
            <span className="gradient-text">demos</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl max-w-2xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
            Explora AgentFlow sin fricción: playground de API, agente de muestra, documentación y el panel demo. Si
            desarrollas en local, arranca también el <strong className="text-foreground">gateway</strong> y el backend
            para que el Playground responda.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/playground"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #0d9488, #6366f1)' }}
            >
              <Code2 size={18} />
              Abrir Playground
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/soluciones"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              Casos por sector
            </Link>
          </div>
        </div>
      </section>

      <section className="pb-20 md:pb-28 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <MessageSquareCode className="h-7 w-7 text-teal-600" />
              Qué puedes probar
            </h2>
            <p className="mt-3" style={{ color: 'var(--muted-foreground)' }}>
              Cada enlace abre en este mismo sitio (landing). El Playground hace proxy al gateway; sin servicios
              backend verás errores de conexión hasta que levantes el ecosistema.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {DEMOS.map((d) => (
              <Link
                key={d.href}
                href={d.href}
                className="group rounded-2xl p-6 md:p-8 text-left transition-all hover:shadow-lg hover:-translate-y-0.5"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: 'rgba(13,148,136,0.12)', color: '#0d9488' }}
                  >
                    {d.icon}
                  </div>
                  {d.badge && (
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-md"
                      style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}
                    >
                      {d.badge}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold mt-5 group-hover:underline underline-offset-4">{d.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                  {d.description}
                </p>
                <span
                  className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold"
                  style={{ color: '#0d9488' }}
                >
                  Entrar
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 border-t" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-xl font-bold">¿Listo para integrar?</h2>
          <p className="mt-3 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Después de los demos, crea tu clave en el dashboard o revisa los planes según volumen y funciones.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm"
              style={{ background: 'linear-gradient(135deg, #0d9488, #6366f1)' }}
            >
              Ir al dashboard
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              Ver pricing
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
