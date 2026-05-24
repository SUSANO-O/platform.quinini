import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Code2,
  Globe2,
  LayoutDashboard,
  Sparkles,
  Cpu,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Demos | BotIvA',
  description:
    'Agentes de ejemplo, panel demo y planes. Todo lo necesario para ver BotIvA en acción.',
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
    title: 'API REST (Team+)',
    description:
      'Documentación interactiva y prueba de endpoints desde el panel, con plan Team o superior. Sin playground público en la landing.',
    href: '/pricing#api',
    icon: <Code2 className="h-6 w-6" />,
    badge: 'Developers',
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
      'Flujo tipo producto: agentes, widgets, inbox y cumplimiento (modo demostración con datos simulados donde aplica).',
    href: '/dashboard',
    icon: <LayoutDashboard className="h-6 w-6" />,
  },
  {
    title: 'Pricing',
    description:
      'Planes Free, Solo, Plus, Starter, Growth y Business — conversaciones, RAG y límites por nivel.',
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
            Explora BotIvA sin fricción: agente de muestra, panel demo y planes. La API REST y su documentación viven
            en el servicio dedicado — disponible desde el plan <strong className="text-foreground">Team</strong>.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/pricing#api"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{
                background: 'var(--brand-primary)',
                boxShadow: '0 4px 20px rgba(var(--brand-primary-rgb),0.28)',
              }}
            >
              <Code2 size={18} />
              Ver API en planes
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              Ir al panel
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 max-w-5xl mx-auto">
        <div className="grid sm:grid-cols-2 gap-5">
          {DEMOS.map((demo) => (
            <Link
              key={demo.href}
              href={demo.href}
              className="group rounded-2xl p-6 transition-all hover:shadow-lg card-texture block no-underline"
              style={{ border: '1px solid var(--border)', color: 'inherit' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(var(--brand-primary-rgb),0.1)', color: 'var(--primary)' }}
                >
                  {demo.icon}
                </div>
                <div className="min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-lg">{demo.title}</h2>
                    {demo.badge ? (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(var(--brand-primary-rgb),0.12)', color: 'var(--primary)' }}
                      >
                        {demo.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                    {demo.description}
                  </p>
                  <span
                    className="inline-flex items-center gap-1 mt-4 text-sm font-semibold group-hover:gap-2 transition-all"
                    style={{ color: 'var(--primary)' }}
                  >
                    Abrir <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
