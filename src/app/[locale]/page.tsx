import React from 'react';
import { getTranslations } from 'next-intl/server';
import { LandingNavbar } from '@/components/landing/landing-navbar';
import { LandingFooter } from '@/components/landing/landing-footer';
import Link from 'next/link';
import {
  Zap, Shield, BarChart3, MessageSquare, Database,
  ArrowRight, Terminal, Globe, Sparkles, Check,
  HeartPulse, Sprout,
  GraduationCap, TrendingUp, Lock, Wrench,
  UserPlus, Palette, Rocket,
  Users, BookOpen, PlayCircle, BadgeCheck, Star,
} from 'lucide-react';
import { PLAN_RAG_LIMITS } from '@/lib/plan-catalog';

const R  = '#e41414';
const O  = '#f87600';
const B  = '#00acf8';
const C  = '#00f8e5';
const Rd = '#bb1b14';

export default async function LandingPage() {
  const t = await getTranslations('landing');

  const AGENTS = [
    { name: 'Health Monitor',    desc: t('agents.health'),       Icon: HeartPulse,    color: R,  focus: 'Salud' },
    { name: 'Smart Agriculture', desc: t('agents.agriculture'),   Icon: Sprout,        color: C,  focus: 'Agro' },
    { name: 'Education AI',      desc: t('agents.education'),     Icon: GraduationCap, color: O,  focus: 'Educacion' },
    { name: 'Geoeconomics',      desc: t('agents.geoeconomics'),  Icon: TrendingUp,    color: B,  focus: 'Economia' },
    { name: 'Cybersecurity',     desc: t('agents.cybersecurity'), Icon: Lock,          color: R,  focus: 'Seguridad' },
    { name: 'Maximo',            desc: t('agents.maximo'),        Icon: Wrench,        color: Rd, focus: 'Industria' },
  ];

  const FEATURES = [
    { icon: Shield,    title: t('features.secureTitle'),      desc: t('features.secureDesc'),      color: Rd, metric: t('features.secureMetric')      },
    { icon: BarChart3, title: t('features.analyticsTitle'),   desc: t('features.analyticsDesc'),   color: C,  metric: t('features.analyticsMetric')   },
    { icon: Globe,     title: t('features.multitenantTitle'), desc: t('features.multitenantDesc'), color: B,  metric: t('features.multitenantMetric') },
  ];

  const HOW = [
    { step: '01', title: t('how.step1Title'), desc: t('how.step1Desc'), Icon: UserPlus, accent: R,  grad: `linear-gradient(135deg,${R},${O})` },
    { step: '02', title: t('how.step2Title'), desc: t('how.step2Desc'), Icon: Palette,  accent: O,  grad: `linear-gradient(135deg,${O},${B})` },
    { step: '03', title: t('how.step3Title'), desc: t('how.step3Desc'), Icon: Terminal,  accent: B,  grad: `linear-gradient(135deg,${B},${C})` },
    { step: '04', title: t('how.step4Title'), desc: t('how.step4Desc'), Icon: Rocket,   accent: C,  grad: `linear-gradient(135deg,${C},${R})` },
  ];

  const PLANS = [
    {
      name: 'Basic',    price: '$14',  period: t('pricing.period'),
      widgets: t('pricing.basic.widgets'),   requests: t('pricing.basic.requests'),
      features: t.raw('pricing.basic.features') as string[],
      color: C, id: 'basic',
    },
    {
      name: 'Starter',  price: '$39',  period: t('pricing.period'),
      widgets: t('pricing.starter.widgets'), requests: t('pricing.starter.requests'),
      features: t.raw('pricing.starter.features') as string[],
      color: B, id: 'starter',
    },
    {
      name: 'Growth',   price: '$99',  period: t('pricing.period'),
      widgets: t('pricing.growth.widgets'),  requests: t('pricing.growth.requests'),
      features: t.raw('pricing.growth.features') as string[],
      color: R, id: 'growth', popular: true,
    },
    {
      name: 'Business', price: '$349', period: t('pricing.period'),
      widgets: t('pricing.business.widgets'), requests: t('pricing.business.requests'),
      features: t.raw('pricing.business.features') as string[],
      color: O, id: 'business',
    },
  ];

  const TESTIMONIALS = t.raw('testimonials.items') as { quote: string; author: string; role: string; company: string }[];

  const WIDGET_BENEFITS = [
    { color: R,  title: t('widget.b1Title'), desc: t('widget.b1Desc') },
    { color: O,  title: t('widget.b2Title'), desc: t('widget.b2Desc') },
    { color: B,  title: t('widget.b3Title'), desc: t('widget.b3Desc') },
    { color: C,  title: t('widget.b4Title'), desc: t('widget.b4Desc') },
    { color: Rd, title: t('widget.b5Title'), desc: t('widget.b5Desc') },
  ];

  const TRAINING_STEPS = [
    { step: '01', Icon: Users,       color: R, title: t('training.step1Title'), desc: t('training.step1Desc'), grad: `linear-gradient(135deg,${R},${O})` },
    { step: '02', Icon: BookOpen,    color: O, title: t('training.step2Title'), desc: t('training.step2Desc'), grad: `linear-gradient(135deg,${O},${B})` },
    { step: '03', Icon: Rocket,      color: B, title: t('training.step3Title'), desc: t('training.step3Desc'), grad: `linear-gradient(135deg,${B},${C})` },
    { step: '04', Icon: PlayCircle,  color: C, title: t('training.step4Title'), desc: t('training.step4Desc'), grad: `linear-gradient(135deg,${C},${R})` },
  ];

  const FAQ_ITEMS = t.raw('faq.items') as { q: string; a: string }[];

  const STATS = [
    { value: '7 días', label: t('stats.trial'),  gradient: `linear-gradient(135deg,${R},${O})` },
    { value: '< 10',   label: t('stats.setup'),  gradient: `linear-gradient(135deg,${O},${B})` },
    { value: '8+',     label: t('stats.models'), gradient: `linear-gradient(135deg,${B},${C})` },
  ];

  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)', position: 'relative' }}>
      <LandingNavbar />

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-24 overflow-hidden">
        <div className="ai-mesh" />
        <div className="hero-glow-strong" style={{ background: R, top: '-200px', left: '5%' }} />
        <div className="hero-glow-strong" style={{ background: O, top: '-100px', right: '3%' }} />
        <div className="hero-glow-strong" style={{ background: B, top: '200px',  left: '40%', opacity: 0.18 }} />

        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <div className="badge-primary mb-8 mx-auto w-fit">
            <Sparkles size={13} />
            {t('badge')}
          </div>

          <h1
            style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 700, letterSpacing: '-0.03em' }}
            className="text-5xl md:text-7xl leading-[1.05]"
          >
            {t('hero.title1')}
            <br />
            <span className="gradient-text">{t('hero.title2')}</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl max-w-2xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
            {t('hero.description')}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.03]"
              style={{ background: `linear-gradient(135deg, ${R}, ${O})`, boxShadow: `0 4px 20px rgba(228,20,20,0.28)` }}
            >
              {t('hero.ctaPrimary')} <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:bg-slate-50"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              {t('hero.ctaAccount')}
            </Link>
            <Link
              href="/widget"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:bg-slate-50"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              <Terminal size={16} /> {t('hero.ctaDocs')}
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-16 max-w-3xl mx-auto">
            <div className="grid grid-cols-3 gap-6">
              {STATS.map(({ value, label, gradient }) => (
                <div
                  key={label}
                  className="card-pro rounded-2xl overflow-hidden flex flex-col items-center text-center"
                  style={{ border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}
                >
                  <div style={{ height: 3, width: '100%', background: gradient }} />
                  <div className="p-6 flex flex-col items-center gap-2">
                    <span
                      className="text-4xl md:text-5xl font-extrabold"
                      style={{ background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                    >
                      {value}
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden" style={{ background: 'var(--muted)' }}>
        <div className="ai-mesh" />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 700, height: 500, pointerEvents: 'none',
          background: `radial-gradient(ellipse, ${R}09 0%, transparent 70%)`,
        }} />

        <div className="max-w-3xl mx-auto relative">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">{t('how.title')}</h2>
            <p className="mt-4" style={{ color: 'var(--muted-foreground)' }}>
              {t('how.subtitle')}
            </p>
          </div>

          <div className="relative">
            <div style={{
              position: 'absolute', left: 27, top: 28, bottom: 28, width: 2,
              background: `linear-gradient(to bottom, ${R}, ${O}, ${B}, ${C})`,
              opacity: 0.25, borderRadius: 2,
            }} />

            <div className="space-y-4">
              {HOW.map((s, i) => (
                <div key={s.step} className="relative flex gap-5 items-stretch group">
                  <div className="relative flex flex-col items-center shrink-0" style={{ width: 64 }}>
                    <div style={{ position: 'relative', display: 'inline-flex' }}>
                      <div style={{
                        position: 'absolute', inset: -5, borderRadius: 24,
                        border: `1px solid ${s.accent}25`, pointerEvents: 'none',
                      }} />
                      <div
                        className="icon-pro relative z-10"
                        style={{
                          width: 60, height: 60,
                          background: s.grad,
                          boxShadow: `0 4px 20px ${s.accent}42, 0 0 0 6px ${s.accent}0a`,
                          color: 'white',
                        }}
                      >
                        <s.Icon size={26} color="white" strokeWidth={1.5} />
                        <div style={{
                          position: 'absolute', top: -8, right: -8,
                          width: 22, height: 22, borderRadius: 999,
                          background: 'var(--muted)',
                          border: `2px solid ${s.accent}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 800, color: s.accent, lineHeight: 1,
                          zIndex: 11,
                        }}>
                          {i + 1}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex-1 relative overflow-hidden rounded-2xl"
                    style={{ background: 'var(--card)', border: `1px solid ${s.accent}22`, boxShadow: `0 1px 3px rgba(0,0,0,0.04)` }}
                  >
                    <div style={{ height: 2, background: s.grad }} />
                    <div style={{
                      position: 'absolute', right: 10, bottom: -12,
                      fontSize: 90, fontWeight: 900, lineHeight: 1,
                      color: s.accent, opacity: 0.045,
                      fontFamily: 'monospace', userSelect: 'none', pointerEvents: 'none',
                    }}>
                      {s.step}
                    </div>
                    <div style={{
                      position: 'absolute', inset: 0, pointerEvents: 'none',
                      backgroundImage: `radial-gradient(circle, ${s.accent}20 1px, transparent 1px)`,
                      backgroundSize: '16px 16px',
                      maskImage: `radial-gradient(ellipse 60% 80% at 95% 10%, black, transparent)`,
                      WebkitMaskImage: `radial-gradient(ellipse 60% 80% at 95% 10%, black, transparent)`,
                    }} />
                    <div className="p-5 relative">
                      <h3 className="text-base font-bold mb-1" style={{ letterSpacing: '-0.02em' }}>{s.title}</h3>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{s.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── AGENTS ───────────────────────────────────────────────────────────── */}
      <section id="agents" className="py-24 px-6 relative overflow-hidden">
        <div className="ai-mesh" />
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold">
              <span className="gradient-text">{t('agents.title')}</span>
            </h2>
            <p className="mt-4 text-lg max-w-3xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
              {t('agents.subtitle')}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: `${R}12`, color: R, border: `1px solid ${R}30` }}>Especializados por dominio</span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: `${O}12`, color: O, border: `1px solid ${O}30` }}>Listos para usar</span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: `${B}12`, color: B, border: `1px solid ${B}30` }}>Integracion via widget</span>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {AGENTS.map((a) => (
              <div
                key={a.name}
                className="card-pro overflow-hidden relative h-full flex flex-col"
                style={{ border: `1px solid ${a.color}28`, boxShadow: '0 8px 32px rgba(0,0,0,0.05)' }}
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
                <div className="p-6 relative flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                      {/* outer ring halo */}
                      <div style={{
                        position: 'absolute', inset: -8, borderRadius: 28,
                        border: `1px solid ${a.color}20`,
                        background: `radial-gradient(circle at 30% 30%, ${a.color}09, transparent 65%)`,
                        pointerEvents: 'none',
                      }} />
                      <div
                        className="icon-pro"
                        style={{
                          width: 72, height: 72,
                          background: `linear-gradient(145deg, ${a.color}1c, ${a.color}08)`,
                          border: `1.5px solid ${a.color}38`,
                          boxShadow: `0 0 0 8px ${a.color}07, 0 0 32px ${a.color}25, inset 0 1px 0 ${a.color}20`,
                          color: a.color,
                        }}
                      >
                        <a.Icon size={30} style={{ color: a.color }} strokeWidth={1.5} />
                      </div>
                    </div>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md"
                      style={{ background: `${a.color}12`, color: a.color, border: `1px solid ${a.color}30` }}
                    >
                      {a.focus}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold mt-5 mb-2" style={{ letterSpacing: '-0.01em' }}>{a.name}</h3>
                  <p className="text-sm leading-relaxed min-h-[62px]" style={{ color: 'var(--muted-foreground)' }}>{a.desc}</p>

                  <div className="mt-5 pt-4 flex items-center justify-between" style={{ borderTop: `1px solid ${a.color}30` }}>
                    <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                      Ideal para equipos operativos
                    </span>
                    <Link
                      href="/register"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                      style={{ background: `${a.color}14`, color: a.color, border: `1px solid ${a.color}35` }}
                    >
                      Probar <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden" style={{ background: 'var(--muted)' }}>
        <div className="ai-mesh" />
        <div style={{ position: 'absolute', top: -80, left: -80, width: 360, height: 360, borderRadius: '50%', background: `radial-gradient(circle, ${R}10, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, right: -80, width: 360, height: 360, borderRadius: '50%', background: `radial-gradient(circle, ${B}10, transparent 70%)`, pointerEvents: 'none' }} />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">{t('features.title')}</h2>
            <p className="mt-4 text-lg" style={{ color: 'var(--muted-foreground)' }}>
              {t('features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
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
                <div className="p-7 relative">
                  <div className="flex items-start justify-between mb-6">
                    <div style={{ position: 'relative', display: 'inline-flex' }}>
                      <div style={{
                        position: 'absolute', inset: -6, borderRadius: 22,
                        border: `1px solid ${f.color}18`, pointerEvents: 'none',
                      }} />
                      <div
                        className="icon-pro"
                        style={{
                          width: 56, height: 56,
                          background: `linear-gradient(145deg, ${f.color}18, ${f.color}08)`,
                          border: `1.5px solid ${f.color}35`,
                          boxShadow: `0 0 0 6px ${f.color}07, 0 0 28px ${f.color}22, inset 0 1px 0 ${f.color}22`,
                          color: f.color,
                        }}
                      >
                        <f.icon size={24} style={{ color: f.color }} strokeWidth={1.5} />
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
                      padding: '3px 9px', borderRadius: 6,
                      background: `${f.color}10`, color: f.color, border: `1px solid ${f.color}28`, whiteSpace: 'nowrap',
                    }}>
                      {f.metric}
                    </span>
                  </div>
                  <h3 className="text-base font-bold mb-2" style={{ letterSpacing: '-0.01em' }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{f.desc}</p>
                  <div style={{ marginTop: 18, height: 1, background: `linear-gradient(90deg, ${f.color}45, transparent)` }} />
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
              {t('widget.badge')}
            </span>
            <h2 className="text-3xl md:text-4xl font-bold">{t('widget.title')}</h2>
            <p className="mt-4 max-w-xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
              {t('widget.subtitle')}
            </p>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', boxShadow: `0 16px 60px rgba(228,20,20,0.10)` }}>
            <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
              <span className="ml-2 text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>{t('widget.windowTitle')}</span>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: '#22c55e' }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#22c55e' }} />
                  {t('widget.live')}
                </span>
                <Link href="/register" className="text-xs font-bold px-3 py-1 rounded-lg text-white" style={{ background: `linear-gradient(135deg,${R},${O})` }}>
                  {t('widget.startFree')}
                </Link>
              </div>
            </div>

            <div className="p-6 md:p-8" style={{ background: 'var(--card)' }}>
              <div className="grid md:grid-cols-2 gap-8 items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: 'var(--muted-foreground)' }}>{t('widget.whyTitle')}</p>
                  {WIDGET_BENEFITS.map(({ color, title, desc }) => (
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

                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: 'var(--muted-foreground)' }}>{t('widget.chatSampleTitle')}</p>
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3 px-4 py-3" style={{ background: `linear-gradient(135deg,${R},${O})` }}>
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">M</div>
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
                        <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg,${R},${O})` }}>M</div>
                        <div className="text-xs px-3 py-2 rounded-2xl rounded-bl-none max-w-[80%]" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                          {t('widget.msg1')}
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="text-xs px-3 py-2 rounded-2xl rounded-br-none max-w-[75%] text-white" style={{ background: `linear-gradient(135deg,${R},${O})` }}>
                          {t('widget.msg2')}
                        </div>
                      </div>
                      <div className="flex gap-2 items-end">
                        <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg,${R},${O})` }}>M</div>
                        <div className="text-xs px-3 py-2 rounded-2xl rounded-bl-none max-w-[80%]" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                          {t.rich('widget.msg3', { strong: (chunks) => <strong>{chunks}</strong> })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
                      <div className="flex-1 text-xs px-3 py-1.5 rounded-xl" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{t('widget.inputPlaceholder')}</div>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg,${R},${O})` }}>
                        <ArrowRight size={13} className="text-white" />
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {t.rich('widget.socialProof', { red: (chunks) => <span style={{ color: R, fontWeight: 700 }}>{chunks}</span> })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIOS ──────────────────────────────────────────────────────── */}
      <section className="py-24 px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold">{t('testimonials.title')}</h2>
            <p className="mt-4 text-lg" style={{ color: 'var(--muted-foreground)' }}>
              {t('testimonials.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((item, i) => {
              const accentColor = [R, B, O][i % 3];
              return (
                <div
                  key={item.author}
                  className="card-pro p-7 flex flex-col gap-5 relative overflow-hidden"
                  style={{ border: `1px solid ${accentColor}25`, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
                >
                  <div style={{
                    position: 'absolute', top: -20, right: -10, width: 120, height: 90,
                    background: `radial-gradient(circle, ${accentColor}12, transparent 70%)`,
                    pointerEvents: 'none',
                  }} />
                  <div style={{
                    fontSize: 64, lineHeight: 1, fontFamily: 'Georgia, serif',
                    color: accentColor, opacity: 0.18, position: 'absolute', top: 12, left: 20,
                    userSelect: 'none', pointerEvents: 'none',
                  }}>
                    "
                  </div>
                  <div className="flex gap-0.5 relative">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} size={13} fill={accentColor} style={{ color: accentColor }} />
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed relative" style={{ color: 'var(--foreground)' }}>
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3 mt-auto pt-4 relative" style={{ borderTop: `1px solid ${accentColor}20` }}>
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)` }}
                    >
                      {item.author.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{item.author}</p>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{item.role} · {item.company}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CAPACITACIÓN Y ACOMPAÑAMIENTO ───────────────────────────────────── */}
      <section id="training" className="py-24 px-6 relative overflow-hidden">
        <div style={{ position: 'absolute', top: -60, right: -60, width: 320, height: 320, borderRadius: '50%', background: `radial-gradient(circle, ${B}08, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 320, height: 320, borderRadius: '50%', background: `radial-gradient(circle, ${O}08, transparent 70%)`, pointerEvents: 'none' }} />

        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4" style={{ background: `rgba(0,172,248,0.08)`, color: B }}>
              {t('training.badge')}
            </span>
            <h2 className="text-3xl md:text-4xl font-bold">{t('training.title')}</h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg" style={{ color: 'var(--muted-foreground)' }}>
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
                <div style={{
                  position: 'absolute', right: 14, bottom: -10,
                  fontSize: 80, fontWeight: 900, lineHeight: 1,
                  color: s.color, opacity: 0.045,
                  fontFamily: 'monospace', userSelect: 'none', pointerEvents: 'none',
                }}>
                  {s.step}
                </div>
                <div className="p-6 relative flex gap-4 items-start">
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
                      <s.Icon size={24} color="white" strokeWidth={1.5} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-base font-bold mb-1.5" style={{ letterSpacing: '-0.01em' }}>{s.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{s.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold" style={{ background: `${C}10`, color: C, border: `1px solid ${C}30` }}>
              <BadgeCheck size={15} />
              {t('training.included')}
            </div>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.03]"
              style={{ background: `linear-gradient(135deg, ${B}, ${C})`, boxShadow: `0 4px 20px rgba(0,172,248,0.28)` }}
            >
              {t('training.cta')} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 relative overflow-hidden" style={{ background: 'var(--muted)' }}>
        <div className="ai-mesh" />
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">{t('pricing.title')}</h2>
            <p className="mt-4" style={{ color: 'var(--muted-foreground)' }}>
              {t('pricing.subtitle')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={plan.popular ? 'card-pro rounded-2xl p-7 relative' : 'card-hover rounded-2xl p-7 relative'}
                style={{
                  backgroundImage: plan.popular
                    ? `linear-gradient(145deg, rgba(228,20,20,0.05), rgba(248,118,0,0.04)), radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)`
                    : `radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)`,
                  backgroundSize: plan.popular ? 'auto, 20px 20px' : '20px 20px',
                  backgroundColor: 'var(--card)',
                  border: `1px solid ${plan.popular ? plan.color : 'var(--border)'}`,
                  boxShadow: plan.popular
                    ? `0 0 0 4px ${plan.color}12, 0 12px 40px rgba(228,20,20,0.14), 0 4px 16px rgba(0,0,0,0.06)`
                    : undefined,
                }}
              >
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
                    background: `linear-gradient(135deg, ${R}, ${O})`,
                    color: '#fff', fontSize: '11px', fontWeight: 700,
                    padding: '4px 16px', borderRadius: '20px', whiteSpace: 'nowrap', letterSpacing: '0.04em',
                  }}>
                    {t('pricing.popular')}
                  </div>
                )}

                <h3 className="text-xl font-extrabold mb-1">{plan.name}</h3>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-extrabold" style={{ color: plan.color }}>{plan.price}</span>
                  <span className="text-sm pb-1" style={{ color: 'var(--muted-foreground)' }}>{plan.period}</span>
                </div>
                <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>{plan.widgets} · {plan.requests}</p>

                <ul className="space-y-3 mb-4">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2 text-sm">
                      <Check size={14} style={{ color: plan.color, flexShrink: 0 }} />
                      {feat}
                    </li>
                  ))}
                </ul>
                {plan.id === 'starter' && (
                  <p className="text-xs font-semibold mb-6 leading-snug" style={{ color: 'var(--muted-foreground)' }}>
                    {t('pricing.ragNotIncluded')}
                  </p>
                )}
                {PLAN_RAG_LIMITS[plan.id] && (
                  <p className="text-xs font-semibold mb-6 leading-snug" style={{ color: 'var(--muted-foreground)' }}>
                    {t('pricing.ragTechnical', {
                      mb: PLAN_RAG_LIMITS[plan.id]!.mb.toLocaleString(),
                      sources: PLAN_RAG_LIMITS[plan.id]!.sources,
                    })}
                  </p>
                )}

                <Link
                  href="/register"
                  className="block text-center py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 hover:shadow-lg text-white"
                  style={{ background: plan.popular ? `linear-gradient(135deg, ${R}, ${O})` : plan.color }}
                >
                  {t('pricing.cta')}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">{t('faq.title')}</h2>
          {FAQ_ITEMS.map((faq) => (
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
        <div className="ai-mesh" />
        <div className="hero-glow-strong" style={{ background: R, bottom: '-220px', left: '15%' }} />
        <div className="hero-glow-strong" style={{ background: O, bottom: '-120px', right: '15%' }} />
        <div className="hero-glow-strong" style={{ background: B, top: '-100px', left: '50%', opacity: 0.18 }} />

        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6">
            {t('cta.title1')}<br />
            <span className="gradient-text">{t('cta.title2')}</span>
          </h2>
          <p className="text-lg mb-10" style={{ color: 'var(--muted-foreground)' }}>
            {t('cta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-semibold transition-all hover:scale-[1.03]"
              style={{ background: `linear-gradient(135deg, ${R}, ${O})`, boxShadow: `0 4px 24px rgba(228,20,20,0.28)` }}
            >
              {t('cta.primary')} <ArrowRight size={18} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm transition-all hover:bg-white"
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
