import React from 'react';
import { getTranslations } from 'next-intl/server';
import { LandingNavbar } from '@/components/landing/landing-navbar';
import { LandingFooter } from '@/components/landing/landing-footer';
import { LandingSectionNav } from '@/components/landing/landing-section-nav';
import { LandingIcon } from '@/components/landing/landing-icon';
import Link from 'next/link';
import { FaqDetails } from '@/components/ui/faq-details';
import { HowStepMock } from '@/components/landing/how-step-mock';
import type { LandingIconName } from '@/lib/landing-icons';
import { PREMIUM, R, B, Rd, BRAND } from '@/lib/brand-colors';
import {
  buildTrainingWhatsAppUrl,
  SALES_WHATSAPP_LINK_PROPS,
} from '@/lib/sales-whatsapp';

/** Mezcla Cognitive Nexus: teal + bronce (sin amarillo) */
const C = BRAND.primaryLight;
const W = BRAND.tertiary;

export default async function LandingPage() {
  const t = await getTranslations('landing');

  const AGENTS: {
    name: string;
    desc: string;
    icon: LandingIconName;
    color: string;
    focus: string;
    slug: string;
  }[] = [
    { name: 'Health Monitor',    desc: t('agents.health'),       icon: 'health-pulse',    color: R,  focus: 'Salud',       slug: 'health' },
    { name: 'Smart Agriculture', desc: t('agents.agriculture'),   icon: 'sprout',        color: C,  focus: 'Agro',        slug: 'agriculture' },
    { name: 'Education AI',      desc: t('agents.education'),     icon: 'graduation-cap', color: W,  focus: 'Educacion',   slug: 'education' },
    { name: 'Geoeconomics',      desc: t('agents.geoeconomics'),  icon: 'trending-up',    color: B,  focus: 'Economia',    slug: 'geoeconomics' },
    { name: 'Cybersecurity',     desc: t('agents.cybersecurity'), icon: 'lock',          color: R,  focus: 'Seguridad',   slug: 'cybersecurity' },
    { name: 'Maximo',            desc: t('agents.maximo'),        icon: 'wrench',        color: Rd, focus: 'Industria',   slug: 'maximo' },
  ];

  const FEATURES: {
    icon: LandingIconName;
    title: string;
    desc: string;
    color: string;
    metric: string;
  }[] = [
    { icon: 'shield',    title: t('features.secureTitle'),      desc: t('features.secureDesc'),      color: Rd, metric: t('features.secureMetric')      },
    { icon: 'bar-chart', title: t('features.analyticsTitle'),   desc: t('features.analyticsDesc'),   color: B,  metric: t('features.analyticsMetric')   },
    { icon: 'globe',     title: t('features.multitenantTitle'), desc: t('features.multitenantDesc'), color: B,  metric: t('features.multitenantMetric') },
  ];

  const HOW: {
    step: number;
    title: string;
    desc: string;
    icon: LandingIconName;
    accent: string;
    variant: 1 | 2 | 3 | 4 | 5;
  }[] = [
    { step: 1, title: t('how.step1Title'), desc: t('how.step1Desc'), icon: 'user-plus', accent: R, variant: 1 },
    { step: 2, title: t('how.step2Title'), desc: t('how.step2Desc'), icon: 'brain',    accent: C, variant: 2 },
    { step: 3, title: t('how.step3Title'), desc: t('how.step3Desc'), icon: 'palette',  accent: R, variant: 3 },
    { step: 4, title: t('how.step4Title'), desc: t('how.step4Desc'), icon: 'terminal', accent: C, variant: 4 },
    { step: 5, title: t('how.step5Title'), desc: t('how.step5Desc'), icon: 'rocket',   accent: R, variant: 5 },
  ];

  const FAQ_ITEMS = t.raw('faq.items') as { q: string; a: string }[];

  const TESTIMONIALS = t.raw('testimonials.items') as { quote: string; author: string; role: string; company: string }[];

  const WIDGET_BENEFITS = [
    { color: R,  title: t('widget.b1Title'), desc: t('widget.b1Desc') },
    { color: C,  title: t('widget.b2Title'), desc: t('widget.b2Desc') },
    { color: B,  title: t('widget.b3Title'), desc: t('widget.b3Desc') },
    { color: Rd, title: t('widget.b4Title'), desc: t('widget.b4Desc') },
    { color: Rd, title: t('widget.b5Title'), desc: t('widget.b5Desc') },
  ];

  const TRAINING_STEPS: {
    step: string;
    icon: LandingIconName;
    color: string;
    title: string;
    desc: string;
    grad: string;
  }[] = [
    { step: '01', icon: 'users',       color: R, title: t('training.step1Title'), desc: t('training.step1Desc'), grad: R },
    { step: '02', icon: 'book-open',    color: C, title: t('training.step2Title'), desc: t('training.step2Desc'), grad: C },
    { step: '03', icon: 'rocket',      color: B, title: t('training.step3Title'), desc: t('training.step3Desc'), grad: B },
    { step: '04', icon: 'play-circle',  color: Rd, title: t('training.step4Title'), desc: t('training.step4Desc'), grad: Rd },
  ];

  return (
    <div className="landing-page">
      <div className="landing-page__bg" aria-hidden>
        <div className="ai-mesh ai-mesh--full" />
        <div className="hero-glow-strong" style={{ background: R, top: '-8%', left: '5%' }} />
        <div className="hero-glow-strong" style={{ background: C, top: '2%', right: '3%' }} />
        <div className="hero-glow-strong" style={{ background: B, top: '28%', left: '38%' }} />
        <div className="hero-glow-strong" style={{ background: R, top: '52%', right: '8%' }} />
        <div className="hero-glow-strong" style={{ background: C, top: '72%', left: '6%' }} />
        <div className="hero-glow-strong" style={{ background: W, top: '38%', right: '5%' }} />
        <div className="hero-glow-strong" style={{ background: B, bottom: '-6%', right: '12%' }} />
      </div>

      <LandingNavbar />
      <LandingSectionNav />

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative pt-24 pb-14 overflow-hidden">
        <div className="relative max-w-5xl mx-auto px-5 text-center">
          <div className="landing-eyebrow mb-5 mx-auto w-fit">
            <LandingIcon name="sparkles" size="sm" />
            {t('badge')}
          </div>

          <h1>
            {t('hero.title1')}
            <br />
            <span className="gradient-text">{t('hero.title2')}</span>
          </h1>

          <p className="landing-lead mt-5 max-w-2xl mx-auto">
            {t('hero.description')}
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <Link
              href="/pricing"
              className="landing-btn inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-all hover:scale-[1.03]"
              style={{ background: R, boxShadow: `0 4px 20px rgba(var(--brand-primary-rgb),0.28)` }}
            >
              {t('hero.ctaPrimary')} <LandingIcon name="arrow-right" size="md" className="text-white" />
            </Link>
            <Link
              href="/login"
              className="landing-btn inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:bg-slate-50"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              {t('hero.ctaAccount')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section className="how-steps-section py-14 px-5 relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-8 max-w-3xl mx-auto">
            <div className="landing-eyebrow mx-auto w-fit">
              <LandingIcon name="zap" size="sm" />
              {t('how.badge')}
            </div>
            <h2 className="landing-section-title mt-5">
              {t('how.title')}
            </h2>
            <p className="landing-lead mt-4">
              {t('how.subtitle')}
            </p>
          </div>

          <div className="how-steps-grid">
            {HOW.map((s) => (
              <article
                key={s.step}
                className="how-step-card card-texture"
                style={{ '--step-accent': s.accent } as React.CSSProperties}
              >
                <div className="how-step-card__icon">
                  <LandingIcon name={s.icon} size="lg" />
                </div>
                <h3 className="how-step-card__title">{s.title}</h3>
                <p className="how-step-card__desc">{s.desc}</p>
                <div className="how-step-card__visual">
                  <span className="how-step-card__watermark" aria-hidden>{s.step}</span>
                  <HowStepMock variant={s.variant} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── AGENTS ───────────────────────────────────────────────────────────── */}
      <section id="agents" className="py-14 px-5 relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-8">
            <h2 className="landing-section-title">
              <span className="gradient-text">{t('agents.title')}</span>
            </h2>
            <p className="landing-lead mt-4 max-w-3xl mx-auto">
              {t('agents.subtitle')}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <span className="landing-label px-3 py-1 rounded-full" style={{ background: `${R}12`, color: R, border: `1px solid ${R}30` }}>Especializados por dominio</span>
              <span className="landing-label px-3 py-1 rounded-full" style={{ background: `${W}12`, color: W, border: `1px solid ${W}30` }}>Ejemplos ilustrativos</span>
              <span className="landing-label px-3 py-1 rounded-full" style={{ background: `${B}12`, color: B, border: `1px solid ${B}30` }}>Crea el tuyo en minutos</span>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map((a) => (
              <Link
                key={a.name}
                href={`/agents/${a.slug}`}
                className="card-pro overflow-hidden relative h-full flex flex-col no-underline transition-transform hover:scale-[1.01]"
                style={{ border: `1px solid ${a.color}28`, boxShadow: '0 8px 32px rgba(0,0,0,0.05)', color: 'inherit' }}
              >
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backgroundImage: `radial-gradient(circle, ${a.color}28 1px, transparent 1px)`,
                  backgroundSize: '18px 18px',
                  maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
                  WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
                }} />
                <div style={{
                  position: 'absolute', top: -40, right: -20, width: 180, height: 140,
                  background: `radial-gradient(ellipse at top right, ${a.color}22 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
                <div style={{ height: 3, background: `linear-gradient(90deg, ${a.color}, ${a.color}33)`, position: 'relative' }} />
                <div className="p-4 relative flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                      <div style={{
                        position: 'absolute', inset: -8, borderRadius: 28,
                        border: `1px solid ${a.color}20`,
                        background: `radial-gradient(circle at 30% 30%, ${a.color}09, transparent 65%)`,
                        pointerEvents: 'none',
                      }} />
                      <div
                        className="icon-pro"
                        style={{
                          width: 58, height: 58,
                          background: `linear-gradient(145deg, ${a.color}1c, ${a.color}08)`,
                          border: `1.5px solid ${a.color}38`,
                          boxShadow: `0 0 0 8px ${a.color}07, 0 0 32px ${a.color}25, inset 0 1px 0 ${a.color}20`,
                          color: a.color,
                        }}
                      >
                        <LandingIcon name={a.icon} size="2xl" style={{ color: a.color }} />
                      </div>
                    </div>
                    <span
                      className="landing-label px-2.5 py-1 rounded-md"
                      style={{ background: `${a.color}12`, color: a.color, border: `1px solid ${a.color}30` }}
                    >
                      {a.focus}
                    </span>
                  </div>

                  <h3 className="landing-card-title mt-4 mb-1.5">{a.name}</h3>
                  <p className="landing-body-sm landing-muted">{a.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section className="py-14 px-5 relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-8">
            <h2 className="landing-section-title">{t('features.title')}</h2>
            <p className="landing-lead mt-4">
              {t('features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="card-pro overflow-hidden relative group"
                style={{ border: `1px solid ${f.color}28` }}
              >
                <div style={{ height: 3, background: `linear-gradient(90deg, ${f.color}, ${f.color}33)` }} />
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backgroundImage: `linear-gradient(${f.color}0e 1px, transparent 1px), linear-gradient(90deg, ${f.color}0e 1px, transparent 1px)`,
                  backgroundSize: '26px 26px',
                  maskImage: 'linear-gradient(135deg, black 0%, transparent 55%)',
                  WebkitMaskImage: 'linear-gradient(135deg, black 0%, transparent 55%)',
                }} />
                <div style={{ position: 'absolute', top: -30, left: -30, width: 160, height: 160, pointerEvents: 'none', background: `radial-gradient(circle, ${f.color}18 0%, transparent 70%)` }} />
                <div className="p-5 relative">
                  <div className="flex items-start justify-between mb-4">
                    <div style={{ position: 'relative', display: 'inline-flex' }}>
                      <div style={{
                        position: 'absolute', inset: -6, borderRadius: 22,
                        border: `1px solid ${f.color}18`, pointerEvents: 'none',
                      }} />
                      <div
                        className="icon-pro"
                        style={{
                          width: 46, height: 46,
                          background: `linear-gradient(145deg, ${f.color}18, ${f.color}08)`,
                          border: `1.5px solid ${f.color}35`,
                          boxShadow: `0 0 0 6px ${f.color}07, 0 0 28px ${f.color}22, inset 0 1px 0 ${f.color}22`,
                          color: f.color,
                        }}
                      >
                        <LandingIcon name={f.icon} size="xl" style={{ color: f.color }} />
                      </div>
                    </div>
                    <span className="landing-label px-2 py-0.5 rounded-md" style={{
                      background: `${f.color}10`, color: f.color, border: `1px solid ${f.color}28`, whiteSpace: 'nowrap',
                    }}>
                      {f.metric}
                    </span>
                  </div>
                  <h3 className="landing-card-title mb-2">{f.title}</h3>
                  <p className="landing-body-sm landing-muted">{f.desc}</p>
                  <div style={{ marginTop: 18, height: 1, background: `linear-gradient(90deg, ${f.color}45, transparent)` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WIDGET BUILDER PREVIEW ──────────────────────────────────────────── */}
      <section className="py-14 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <span className="landing-eyebrow mb-4">
              {t('widget.badge')}
            </span>
            <h2 className="landing-section-title">{t('widget.title')}</h2>
            <p className="landing-lead mt-4 max-w-xl mx-auto">
              {t('widget.subtitle')}
            </p>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', boxShadow: `0 16px 60px rgba(var(--brand-primary-rgb),0.10)` }}>
            <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
              <span className="ml-2 text-xs font-mono landing-muted">{t('widget.windowTitle')}</span>
              <div className="ml-auto flex items-center gap-3">
                <span className="landing-body-sm font-medium flex items-center gap-1.5" style={{ color: '#22c55e' }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#22c55e' }} />
                  {t('widget.live')}
                </span>
                <Link
                  href="/pricing"
                  className="landing-btn text-xs px-3 py-1 rounded-lg text-white"
                  style={{ background: R }}
                >
                  {t('widget.startFree')}
                </Link>
              </div>
            </div>

            <div className="p-4 md:p-5" style={{ background: 'var(--card)' }}>
              <div className="grid md:grid-cols-2 gap-8 items-start">
                <div>
                  <p className="landing-label landing-muted mb-5">{t('widget.whyTitle')}</p>
                  {WIDGET_BENEFITS.map(({ color, title, desc }) => (
                    <div key={title} className="flex items-start gap-3 mb-4">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${color}20`, color }}>
                        <LandingIcon name="check" size="xs" strokeWidth={2.5} />
                      </div>
                      <div>
                        <span className="landing-body-sm font-semibold">{title}</span>
                        <p className="text-xs mt-0.5 landing-muted">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="landing-label landing-muted mb-5">{t('widget.chatSampleTitle')}</p>
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3 px-4 py-3" style={{ background: R }}>
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white landing-btn text-sm">M</div>
                      <div>
                        <p className="text-xs font-bold text-white">{t('widget.assistantName')}</p>
                        <p className="text-xs text-white/70 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-300 inline-block" />
                          {t('widget.available')}
                        </p>
                      </div>
                    </div>
                    <div className="p-4 space-y-3" style={{ background: 'var(--background)', minHeight: 200 }}>
                      <div className="flex gap-2 items-end">
                        <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs landing-btn" style={{ background: R }}>M</div>
                        <div className="text-xs px-3 py-2 rounded-2xl rounded-bl-none max-w-[80%]" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                          {t('widget.msg1')}
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="text-xs px-3 py-2 rounded-2xl rounded-br-none max-w-[75%] text-white" style={{ background: R }}>
                          {t('widget.msg2')}
                        </div>
                      </div>
                      <div className="flex gap-2 items-end">
                        <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs landing-btn" style={{ background: R }}>M</div>
                        <div className="text-xs px-3 py-2 rounded-2xl rounded-bl-none max-w-[80%]" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                          {t.rich('widget.msg3', { strong: (chunks) => <strong>{chunks}</strong> })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
                      <div className="flex-1 text-xs px-3 py-1.5 rounded-xl landing-muted" style={{ background: 'var(--muted)' }}>{t('widget.inputPlaceholder')}</div>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: R }}>
                        <LandingIcon name="arrow-right" size="sm" className="text-white" />
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-center text-xs landing-muted">
                    {t.rich('widget.socialProof', { red: (chunks) => <span style={{ color: R, fontWeight: 700 }}>{chunks}</span> })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIOS ──────────────────────────────────────────────────────── */}
      <section className="py-14 px-5 relative">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="landing-section-title">{t('testimonials.title')}</h2>
            <p className="landing-lead mt-4">
              {t('testimonials.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {TESTIMONIALS.map((item, i) => {
              const accentColor = [R, B, W][i % 3];
              return (
                <div
                  key={item.author}
                  className="card-pro p-5 flex flex-col gap-4 relative overflow-hidden"
                  style={{ border: `1px solid ${accentColor}25`, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
                >
                  <div style={{
                    position: 'absolute', top: -20, right: -10, width: 120, height: 90,
                    background: `radial-gradient(circle, ${accentColor}12, transparent 70%)`,
                    pointerEvents: 'none',
                  }} />
                  <div
                    className="landing-display"
                    style={{
                      fontSize: 64, lineHeight: 1,
                      color: accentColor, opacity: 0.18, position: 'absolute', top: 12, left: 20,
                      userSelect: 'none', pointerEvents: 'none',
                    }}
                    aria-hidden
                  >
                    &ldquo;
                  </div>
                  <div className="flex gap-0.5 relative">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <LandingIcon key={s} name="star" size="sm" filled style={{ color: accentColor }} />
                    ))}
                  </div>
                  <p className="landing-body-sm relative">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3 mt-auto pt-4 relative" style={{ borderTop: `1px solid ${accentColor}20` }}>
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white landing-btn text-sm shrink-0"
                      style={{ background: accentColor }}
                    >
                      {item.author.charAt(0)}
                    </div>
                    <div>
                      <p className="landing-body-sm font-bold">{item.author}</p>
                      <p className="text-xs landing-muted">{item.role} · {item.company}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CAPACITACIÓN Y ACOMPAÑAMIENTO ───────────────────────────────────── */}
      <section id="training" className="py-14 px-5 relative overflow-hidden">
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-8">
            <span className="landing-eyebrow mb-4">
              {t('training.badge')}
            </span>
            <h2 className="landing-section-title">{t('training.title')}</h2>
            <p className="landing-lead mt-4 max-w-2xl mx-auto">
              {t('training.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {TRAINING_STEPS.map((s) => (
              <div
                key={s.step}
                className="card-hover rounded-2xl overflow-hidden relative group"
                style={{ background: 'var(--card)', border: `1px solid ${s.color}22`, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
              >
                <div style={{ height: 3, background: s.grad }} />
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backgroundImage: `radial-gradient(circle, ${s.color}20 1px, transparent 1px)`,
                  backgroundSize: '18px 18px',
                  maskImage: 'radial-gradient(ellipse 80% 80% at 95% 5%, black 30%, transparent 70%)',
                  WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 95% 5%, black 30%, transparent 70%)',
                }} />
                <div
                  className="landing-display"
                  style={{
                    position: 'absolute', right: 14, bottom: -10,
                    fontSize: 80, lineHeight: 1,
                    color: s.color, opacity: 0.045,
                    userSelect: 'none', pointerEvents: 'none',
                  }}
                  aria-hidden
                >
                  {s.step}
                </div>
                <div className="p-5 relative flex gap-3.5 items-start">
                  <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                    <div style={{
                      position: 'absolute', inset: -5, borderRadius: 22,
                      border: `1px solid ${s.color}22`, pointerEvents: 'none',
                    }} />
                    <div
                      className="icon-pro"
                      style={{
                        width: 56, height: 56,
                        background: s.grad,
                        boxShadow: `0 4px 20px ${s.color}40, 0 0 0 6px ${s.color}09`,
                        color: 'white',
                      }}
                    >
                      <LandingIcon name={s.icon} size="xl" className="text-white" />
                    </div>
                  </div>
                  <div>
                    <h3 className="landing-card-title mb-1.5">{s.title}</h3>
                    <p className="landing-body-sm landing-muted">{s.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <div className="landing-btn flex items-center gap-2 px-4 py-2 rounded-full text-sm" style={{ background: `${PREMIUM.accent}10`, color: PREMIUM.accent, border: `1px solid ${PREMIUM.border}` }}>
              <LandingIcon name="badge-check" size="md" />
              {t('training.included')}
            </div>
            <a
              href={buildTrainingWhatsAppUrl()}
              {...SALES_WHATSAPP_LINK_PROPS}
              className="landing-btn inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-all hover:scale-[1.03]"
              style={{ background: R, boxShadow: `0 4px 20px rgba(var(--brand-primary-rgb),0.22)` }}
            >
              {t('training.cta')} <LandingIcon name="arrow-right" size="md" className="text-white" />
            </a>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section className="py-14 px-5">
        <div className="max-w-3xl mx-auto">
          <h2 className="landing-section-title text-center mb-8">{t('faq.title')}</h2>
          {FAQ_ITEMS.map((faq) => (
            <FaqDetails key={faq.q} question={faq.q} answer={faq.a} accent={R} />
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="py-14 px-5 text-center relative overflow-hidden">
        <div className="relative max-w-2xl mx-auto">
          <h2 className="landing-section-title mb-4">
            {t('cta.title1')}<br />
            <span className="gradient-text">{t('cta.title2')}</span>
          </h2>
          <p className="landing-lead mb-6">
            {t('cta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/pricing"
              className="landing-btn inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-all hover:scale-[1.03]"
              style={{ background: R, boxShadow: `0 4px 24px rgba(var(--brand-primary-rgb),0.28)` }}
            >
              {t('cta.primary')} <LandingIcon name="arrow-right" size="md" className="text-white" />
            </Link>
            <Link
              href="/login"
              className="landing-btn inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:bg-white"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              {t('cta.secondary')}
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
