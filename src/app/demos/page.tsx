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
  title: 'Demos | MatIAs',
  description:
    'Prueba la API, el playground, agentes de ejemplo y el panel demo. Todo lo necesario para verMatIAsen acción.',
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
        <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-180px', left: '8%' }} />
        <div className="hero-glow" style={{ background: 'var(--accent-warm)', top: '-80px', right: '0%' }} />
        <div className="hero-glow" style={{ background: 'var(--accent)', top: '180px', left: '42%' }} />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="badge-primary mb-8 mx-auto w-fit">
            <Sparkles size={13} />
            Demos y entornos de prueba
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.1]">
            Landing de{' '}
            <span className="gradient-text">demos</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl max-w-2xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
            ExploraMatIAssin fricción: playground de API, agente de muestra, documentación y el panel demo. Si
            desarrollas en local, arranca también el <strong className="text-foreground">gateway</strong> y el backend
            para que el Playground responda.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/playground"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{
                background: 'linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))',
                boxShadow: '0 4px 20px rgba(228,20,20,0.28)',
              }}
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
              <MessageSquareCode className="h-7 w-7 shrink-0" style={{ color: 'var(--primary)' }} />
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
                className="group rounded-2xl p-6 md:p-8 text-left transition-all card-hover"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: 'rgba(228,20,20,0.1)', border: '1px solid rgba(228,20,20,0.2)', color: 'var(--primary)' }}
                  >
                    {d.icon}
                  </div>
                  {d.badge && (
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-md"
                      style={{ background: 'rgba(0,172,248,0.12)', color: 'var(--accent)' }}
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
                  style={{ color: 'var(--primary)' }}
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
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm"
              style={{
                background: 'linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))',
                boxShadow: '0 4px 16px rgba(228,20,20,0.22)',
              }}
            >
              Crear cuenta gratis
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
