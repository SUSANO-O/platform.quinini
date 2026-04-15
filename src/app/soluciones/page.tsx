import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Droplets,
  HeartPulse,
  Leaf,
  GraduationCap,
  Microscope,
  ShieldCheck,
  Clock,
  TrendingDown,
  Users,
  LineChart,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Soluciones por sector | MatIAs',
  description:
    'Casos de uso reales: salud, agua, agricultura, educación y más. Resultados operativos, no promesas vacías.',
};

type SectorCase = {
  icon: LucideIcon;
  sector: string;
  headline: string;
  problem: string;
  outcome: string;
  result: string;
};

const SECTORS: SectorCase[] = [
  {
    icon: HeartPulse,
    sector: 'Salud y bienestar',
    headline: 'Priorizar alertas antes de que escalen',
    problem:
      'Equipos saturados revisando señales de dispositivos y formularios a mano; se pierden patrones entre turnos.',
    outcome:
      'Priorización automática de casos según reglas clínicas y contexto, con explicación clara para el profesional.',
    result: 'Menos tiempo en triage repetitivo y respuesta más rápida ante riesgo.',
  },
  {
    icon: Droplets,
    sector: 'Agua y servicios públicos',
    headline: 'Detectar riesgos de calidad sin esperar el informe semanal',
    problem:
      'Mediciones dispersas y reportes tardíos; cuando llega el problema, la comunidad ya estuvo expuesta.',
    outcome:
      'Lectura continua de parámetros y avisos cuando algo sale del rango operativo acordado.',
    result: 'Intervenciones antes y menos incidentes evitables.',
  },
  {
    icon: Leaf,
    sector: 'Agricultura y cadena de suministro',
    headline: 'Decidir riego y recursos con lo que ocurre en el campo',
    problem:
      'Decisiones basadas en intuición o datos atrasados; el clima y el suelo cambian más rápido que el Excel.',
    outcome:
      'Síntesis de imágenes, sensores y histórico en recomendaciones accionables para el equipo de campo.',
    result: 'Menos desperdicio de agua e insumos; mejor planificación por lote.',
  },
  {
    icon: GraduationCap,
    sector: 'Educación y formación',
    headline: 'Acompañar a cada alumno sin multiplicar horas de tutoría',
    problem:
      'Mismas preguntas mil veces, alumnos rezagados sin seguimiento y contenido genérico para todos.',
    outcome:
      'Rutas y explicaciones adaptadas al ritmo, con seguimiento para el docente sobre dónde hay lagunas.',
    result: 'Más acompañamiento efectivo sin contratar un tutor por alumno.',
  },
  {
    icon: Microscope,
    sector: 'Investigación y laboratorio',
    headline: 'Acotar hipótesis antes del ensayo costoso',
    problem:
      'Muchas moléculas candidatas y poco tiempo para priorizar; el cuello de botella está en la primera criba.',
    outcome:
      'Resumen estructurado de propiedades y riesgos conocidos para enfocar el trabajo de banco y biólogos.',
    result: 'Menos ensayos inútiles y mejor uso del presupuesto de I+D.',
  },
  {
    icon: ShieldCheck,
    sector: 'Riesgo y cumplimiento',
    headline: 'Responder auditorías con trazabilidad',
    problem:
      'Preguntas repetidas de reguladores y clientes; respuestas inconsistentes entre áreas.',
    outcome:
      'Respuestas alineadas a políticas internas y registro de qué fuente respalda cada afirmación.',
    result: 'Menos idas y vueltas en auditorías y menor riesgo reputacional.',
  },
];

const STORIES = [
  {
    title: 'Red comunitaria de monitoreo',
    body: 'Una ONG pasó de hojas de cálculo compartidas a alertas el mismo día en que un parámetro salió de rango. El equipo dejó de dedicar fines de semana a armar informes reactivos.',
    tag: 'Operaciones',
  },
  {
    title: 'Clínica con alta rotación en admisión',
    body: 'Estandarizaron el primer contacto con el paciente: menos errores en anamnesis y más tiempo cara a cara con quien lo necesita.',
    tag: 'Salud',
  },
  {
    title: 'Cooperativa agrícola',
    body: 'Los técnicos reciben un resumen por finca en lugar de cruzar cinco sistemas. Las decisiones de riego quedaron documentadas para la próxima campaña.',
    tag: 'Campo',
  },
];

const PILLARS = [
  {
    icon: Clock,
    title: 'Tiempo recuperado',
    text: 'Menos copiar, pegar y reconciliar. El equipo vuelve al trabajo que solo las personas pueden hacer.',
  },
  {
    icon: TrendingDown,
    title: 'Coste de error',
    text: 'Detectar antes el desvío operativo o regulatorio suele costar órdenes de magnitud menos que remediar después.',
  },
  {
    icon: Users,
    title: 'Adopción',
    text: 'Si la salida no es útil en el día a día, no sirve. Diseñamos para quien ejecuta, no solo para TI.',
  },
];

export default function SolucionesPage() {
  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 px-6 overflow-hidden">
        <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-180px', left: '5%' }} />
        <div className="hero-glow" style={{ background: 'var(--accent)', top: '80px', right: '0' }} />
        <div className="hero-glow" style={{ background: 'var(--accent-warm)', top: '200px', left: '45%' }} />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="badge-primary mb-6 mx-auto w-fit">
            <Building2 size={13} />
            Operaciones reales, no solo demos
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.12]">
            Soluciones que se ven en{' '}
            <span className="gradient-text">menos incidentes, menos horas perdidas y más claridad</span>
          </h1>

          <p
            className="mt-6 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
            style={{ color: 'var(--muted-foreground)' }}
          >
            No vendemos “inteligencia artificial” como concepto: trabajamos contigo en{' '}
            <strong style={{ color: 'var(--foreground)' }}>problemas concretos</strong> — calidad del servicio,
            seguridad del paciente, cumplimiento, coste de campo o tiempo del equipo — con entregables que tu
            organización puede medir.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{
                background: 'linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))',
                boxShadow: '0 4px 20px rgba(228,20,20,0.28)',
              }}
            >
              Empezar ahora <ArrowRight size={16} />
            </Link>
            <a
              href="#sectores"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              Ver casos por sector
            </a>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="py-16 px-6 border-t" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 md:gap-10">
            {PILLARS.map((p) => (
              <div key={p.title} className="text-center md:text-left">
                <div
                  className="mx-auto md:mx-0 w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(228,20,20,0.1)', border: '1px solid rgba(228,20,20,0.2)' }}
                >
                  <p.icon size={22} style={{ color: 'var(--primary)' }} />
                </div>
                <h3 className="text-lg font-bold mb-2">{p.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                  {p.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sectors */}
      <section id="sectores" className="py-20 md:py-28 px-6 scroll-mt-24">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Dónde ya estamos ayudando
            </h2>
            <p className="mt-4 text-lg" style={{ color: 'var(--muted-foreground)' }}>
              Cada bloque resume un <strong style={{ color: 'var(--foreground)' }}>dolor real</strong>, qué
              cambiamos en la operación y qué suele mejorar. Sin jerga de laboratorio.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {SECTORS.map((s) => (
              <article
                key={s.sector}
                className="rounded-2xl p-8 transition-all card-hover"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-start gap-4 mb-5">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(228,20,20,0.1)', border: '1px solid rgba(228,20,20,0.2)' }}
                  >
                    <s.icon size={22} style={{ color: 'var(--primary)' }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                      {s.sector}
                    </p>
                    <h3 className="text-xl font-bold mt-1 leading-snug">{s.headline}</h3>
                  </div>
                </div>

                <dl className="space-y-4 text-sm leading-relaxed">
                  <div>
                    <dt className="font-semibold" style={{ color: 'var(--foreground)' }}>
                      Situación habitual
                    </dt>
                    <dd style={{ color: 'var(--muted-foreground)' }} className="mt-1">
                      {s.problem}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold" style={{ color: 'var(--foreground)' }}>
                      Qué ponemos encima de la mesa
                    </dt>
                    <dd style={{ color: 'var(--muted-foreground)' }} className="mt-1">
                      {s.outcome}
                    </dd>
                  </div>
                  <div
                    className="rounded-xl px-4 py-3 mt-4"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
                  >
                    <dt className="font-semibold flex items-center gap-2 text-xs uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                      <LineChart size={14} className="shrink-0" />
                      Resultado que buscan nuestros clientes
                    </dt>
                    <dd className="mt-2 font-medium" style={{ color: 'var(--foreground)' }}>
                      {s.result}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Stories */}
      <section className="py-20 px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold">Historias típicas</h2>
            <p className="mt-4" style={{ color: 'var(--muted-foreground)' }}>
              No son garantías legales: son el tipo de cambio que buscamos cuando un proyecto está bien acotado.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {STORIES.map((story) => (
              <blockquote
                key={story.title}
                className="rounded-2xl p-8 text-left"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-md"
                  style={{ background: 'rgba(0,172,248,0.12)', color: 'var(--accent)' }}
                >
                  {story.tag}
                </span>
                <h3 className="text-lg font-bold mt-4 mb-3">{story.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                  {story.body}
                </p>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="py-20 md:py-28 px-6 text-center relative overflow-hidden">
        <div className="hero-glow" style={{ background: 'var(--accent-warm)', bottom: '-200px', right: '10%' }} />
        <div className="hero-glow" style={{ background: 'var(--gradient-start)', bottom: '-120px', left: '20%' }} />

        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
            ¿Tu operación tiene un cuello de botella parecido?
          </h2>
          <p className="text-lg mb-10" style={{ color: 'var(--muted-foreground)' }}>
            Cuéntanos el proceso, no la tecnología. A partir de ahí definimos un piloto con métricas claras.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{
                background: 'linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))',
                boxShadow: '0 4px 20px rgba(228,20,20,0.28)',
              }}
            >
              Crear cuenta y probar <ArrowRight size={16} />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              Documentación técnica
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
