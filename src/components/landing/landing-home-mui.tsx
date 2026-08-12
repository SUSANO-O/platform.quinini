'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  Box,
  Button,
  Container,
  Grid,
  Stack,
  Typography,
  Paper,
  Divider,
} from '@mui/material';
import {
  ArrowRight as ArrowForwardIcon,
  CheckCircle as CheckCircleOutlineIcon,
  Bot,
  Boxes,
  LayoutDashboard,
  Braces,
} from '@/components/ui/icons';
import { LandingNavbar } from '@/components/landing/landing-navbar';
import { LandingFooter } from '@/components/landing/landing-footer';
import { BotivaOrbLogo } from '@/components/brand/botiva-orb-logo';
import { HowStepMock } from '@/components/landing/how-step-mock';
import type { LandingIconName } from '@/lib/landing-icons';
import { BRAND } from '@/lib/brand-colors';
import {
  buildTrainingWhatsAppUrl,
  SALES_WHATSAPP_LINK_PROPS,
} from '@/lib/sales-whatsapp';

export type LandingCopy = {
  badge: string;
  hero: { title1: string; title2: string; description: string; ctaPrimary: string; ctaAccount: string };
  productStrip: { agents: string; agentsDesc: string; widget: string; widgetDesc: string; panel: string; panelDesc: string; api: string; apiDesc: string };
  how: { badge: string; title: string; subtitle: string; steps: { title: string; desc: string; icon: LandingIconName; accent: string; variant: 1 | 2 | 3 | 4 | 5 | 6 }[] };
  agents: { title: string; subtitle: string; items: { name: string; desc: string; icon: LandingIconName; color: string; focus: string; slug: string }[] };
  features: { title: string; subtitle: string; items: { icon: LandingIconName; title: string; desc: string; color: string; metric: string }[] };
  widget: {
    badge: string;
    title: string;
    subtitle: string;
    windowTitle: string;
    live: string;
    startFree: string;
    whyTitle: string;
    chatSampleTitle: string;
    assistantName: string;
    available: string;
    msg1: string;
    msg2: string;
    msg3: string;
    inputPlaceholder: string;
    socialProof: string;
    benefits: { color: string; title: string; desc: string }[];
  };
  testimonials: { title: string; subtitle: string; items: { quote: string; author: string; role: string; company: string }[] };
  training: {
    badge: string;
    title: string;
    subtitle: string;
    included: string;
    cta: string;
    steps: { step: string; icon: LandingIconName; color: string; title: string; desc: string }[];
  };
  cta: { title1: string; title2: string; subtitle: string; primary: string; secondary: string };
};

const R = BRAND.primary;

const TESTIMONIAL_PHOTOS = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=128&h=128&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=128&h=128&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=128&h=128&q=80',
];

export function LandingHomeMui({ copy }: { copy: LandingCopy }) {
  const strip = [
    { k: copy.productStrip.agents, d: copy.productStrip.agentsDesc, icon: Bot, href: '#agents' },
    { k: copy.productStrip.widget, d: copy.productStrip.widgetDesc, icon: Boxes, href: '/pricing' },
    { k: copy.productStrip.panel, d: copy.productStrip.panelDesc, icon: LayoutDashboard, href: '/login' },
    { k: copy.productStrip.api, d: copy.productStrip.apiDesc, icon: Braces, href: '/pricing' },
  ];

  return (
    <Box className="landing-page" sx={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div className="landing-page__bg" aria-hidden>
        <div className="landing-page__blob landing-page__blob--a" />
        <div className="landing-page__blob landing-page__blob--b" />
        <div className="landing-page__blob landing-page__blob--c" />
      </div>

      <LandingNavbar />

      {/* HERO — brand + headline + CTA + imagen dominante */}
      <section className="landing-hero">
        <Container maxWidth="md" className="landing-hero__inner">
          <div className="landing-hero__badge-wrap">
            <span className="landing-eyebrow">{copy.badge}</span>
          </div>

          <h1 className="landing-hero__title">
            {copy.hero.title1}
            <span className="landing-accent">{copy.hero.title2}</span>
          </h1>

          <p className="landing-lead landing-hero__lead">{copy.hero.description}</p>

          <div className="landing-hero__actions">
            <Button
              className="landing-btn"
              component={Link}
              href="/pricing"
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon size={18} />}
              sx={{ px: 2.75, py: 1.15, borderRadius: 999 }}
            >
              {copy.hero.ctaPrimary}
            </Button>
            <Button
              className="landing-btn"
              component={Link}
              href="/login"
              variant="outlined"
              size="large"
              color="inherit"
              sx={{
                px: 2.75,
                py: 1.15,
                borderRadius: 999,
                bgcolor: 'rgba(255,255,255,0.8)',
                borderColor: 'rgba(15,23,42,0.12)',
              }}
            >
              {copy.hero.ctaAccount}
            </Button>
          </div>

          <div className="landing-hero__media">
            <Image
              src="/landing/hero.jpg"
              alt="Equipo trabajando con agentes de IA"
              fill
              priority
              sizes="(max-width: 1100px) 100vw, 1080px"
              style={{ objectFit: 'cover' }}
            />
          </div>
        </Container>
      </section>

      <section className="landing-strip-section" aria-label="Productos BotIvA">
        <Container maxWidth="lg">
          <div className="landing-strip">
            {strip.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.k} href={item.href} className="landing-strip__item">
                  <span className="landing-strip__icon" aria-hidden>
                    <Icon size={18} />
                  </span>
                  <span className="landing-strip__copy">
                    <span className="landing-strip__k">{item.k}</span>
                    <span className="landing-strip__d">{item.d}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </Container>
      </section>

      {/* HOW + imagen editorial */}
      <section className="landing-section landing-section--soft landing-how-section">
        <Container maxWidth="lg" sx={{ px: { xs: 3, sm: 4, md: 5 } }}>
          <div className="landing-split" style={{ marginBottom: '2.75rem' }}>
            <div>
              <span className="landing-eyebrow">{copy.how.badge}</span>
              <h2 className="landing-section-title" style={{ margin: '1rem 0 0.85rem' }}>
                {copy.how.title}
              </h2>
              <p className="landing-lead" style={{ margin: 0 }}>
                {copy.how.subtitle}
              </p>
            </div>
            <div className="landing-split__media">
              <Image
                src="/landing/team.jpg"
                alt="Colaboración con BotIvA"
                fill
                sizes="(max-width: 900px) 100vw, 520px"
                style={{ objectFit: 'cover' }}
              />
            </div>
          </div>

          <div className="landing-how-grid-wrap">
            <Grid container spacing={1.5}>
            {copy.how.steps.map((s, idx) => (
              <Grid key={s.title} size={{ xs: 12, sm: 6, lg: 4 }}>
                <article className="landing-how-card landing-how-card--compact">
                  <div className="landing-how-card__media">
                    <HowStepMock variant={s.variant} />
                  </div>
                  <div className="landing-how-card__body">
                    <p className="landing-how-card__n">0{idx + 1}</p>
                    <h3 className="landing-card-title" style={{ margin: '0 0 0.45rem' }}>
                      {s.title}
                    </h3>
                    <p className="landing-body-sm" style={{ margin: 0 }}>
                      {s.desc}
                    </p>
                  </div>
                </article>
              </Grid>
            ))}
            </Grid>
          </div>
        </Container>
      </section>

      {/* AGENTS */}
      <section id="agents" className="landing-section">
        <Container maxWidth="lg">
          <div className="landing-section__head">
            <h2 className="landing-section-title" style={{ color: R, margin: '0 0 0.75rem' }}>
              {copy.agents.title}
            </h2>
            <p className="landing-lead" style={{ margin: '0 auto' }}>
              {copy.agents.subtitle}
            </p>
          </div>
          <div className="landing-agent-grid">
            {copy.agents.items.map((a) => (
              <Link
                key={a.slug}
                href={`/agents/${a.slug}`}
                className="landing-agent-card"
                style={{ ['--agent-accent' as string]: a.color }}
              >
                <span className="landing-agent-card__focus">{a.focus}</span>
                <h3 className="landing-card-title" style={{ margin: '0 0 0.55rem' }}>
                  {a.name}
                </h3>
                <p className="landing-body-sm" style={{ margin: 0 }}>
                  {a.desc}
                </p>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* FEATURES + chat image */}
      <section className="landing-section landing-section--soft">
        <Container maxWidth="lg">
          <div className="landing-split" style={{ marginBottom: '2.5rem' }}>
            <div className="landing-split__media" style={{ aspectRatio: '16 / 10' }}>
              <Image
                src="/landing/chat.jpg"
                alt="Conversación con asistente en el móvil"
                fill
                sizes="(max-width: 900px) 100vw, 520px"
                style={{ objectFit: 'cover' }}
              />
            </div>
            <div>
              <h2 className="landing-section-title" style={{ margin: '0 0 0.85rem' }}>
                {copy.features.title}
              </h2>
              <p className="landing-lead" style={{ margin: 0 }}>
                {copy.features.subtitle}
              </p>
            </div>
          </div>
          <div className="landing-feature-grid">
            {copy.features.items.map((f) => (
              <article
                key={f.title}
                className="landing-feature"
                style={{ ['--feature-accent' as string]: f.color }}
              >
                <p className="landing-feature__metric">{f.metric}</p>
                <h3 className="landing-card-title" style={{ margin: '0 0 0.55rem' }}>
                  {f.title}
                </h3>
                <p className="landing-body-sm" style={{ margin: 0 }}>
                  {f.desc}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* WIDGET */}
      <section className="landing-section">
        <Container maxWidth="md">
          <div className="landing-section__head">
            <span className="landing-eyebrow">{copy.widget.badge}</span>
            <h2 className="landing-section-title" style={{ margin: '1rem 0 0.75rem' }}>
              {copy.widget.title}
            </h2>
            <p className="landing-lead" style={{ margin: '0 auto' }}>
              {copy.widget.subtitle}
            </p>
          </div>

          <Paper
            elevation={0}
            sx={{
              border: '1px solid rgba(15,23,42,0.08)',
              overflow: 'hidden',
              borderRadius: '22px',
              bgcolor: '#fff',
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ px: 2, py: 1.5, bgcolor: 'rgba(15,23,42,0.03)', borderBottom: '1px solid rgba(15,23,42,0.08)' }}
            >
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ef4444' }} />
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f59e0b' }} />
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#22c55e' }} />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, fontFamily: 'monospace' }}>
                {copy.widget.windowTitle}
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Button component={Link} href="/pricing" size="small" variant="contained" className="landing-btn" sx={{ borderRadius: 999 }}>
                {copy.widget.startFree}
              </Button>
            </Stack>

            <Grid container spacing={3} sx={{ p: { xs: 2, md: 3 } }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography className="landing-label" sx={{ mb: 1.25 }}>
                  {copy.widget.whyTitle}
                </Typography>
                <Stack spacing={2}>
                  {copy.widget.benefits.map((b) => (
                    <Stack key={b.title} direction="row" spacing={1.5} alignItems="flex-start">
                      <CheckCircleOutlineIcon size={18} style={{ color: b.color, marginTop: 2 }} />
                      <Box>
                        <Typography sx={{ fontWeight: 650, fontSize: '0.9rem', letterSpacing: '-0.02em' }}>
                          {b.title}
                        </Typography>
                        <Typography className="landing-body-sm">{b.desc}</Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography className="landing-label" sx={{ mb: 1.25 }}>
                  {copy.widget.chatSampleTitle}
                </Typography>
                <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: '16px' }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.25}
                    sx={{ px: 2, py: 1.5, bgcolor: '#fff', borderBottom: '1px solid rgba(15,23,42,0.08)' }}
                  >
                    <BotivaOrbLogo size={36} className="shrink-0" />
                    <Box>
                      <Typography sx={{ fontWeight: 650, fontSize: '0.9rem', lineHeight: 1.25 }}>
                        {copy.widget.assistantName}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {copy.widget.available}
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack spacing={1.5} sx={{ p: 2, bgcolor: '#f8fafc', minHeight: 180 }}>
                    <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
                      <BotivaOrbLogo size={22} className="shrink-0" style={{ marginBottom: 2 }} />
                      <Paper sx={{ p: 1.25, borderRadius: '14px', flex: 1 }} elevation={0}>
                        <Typography variant="body2">{copy.widget.msg1}</Typography>
                      </Paper>
                    </Stack>
                    <Paper sx={{ p: 1.25, alignSelf: 'flex-end', maxWidth: '80%', bgcolor: R, color: '#fff', borderRadius: '14px' }} elevation={0}>
                      <Typography variant="body2">{copy.widget.msg2}</Typography>
                    </Paper>
                    <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
                      <BotivaOrbLogo size={22} className="shrink-0" style={{ marginBottom: 2 }} />
                      <Paper sx={{ p: 1.25, borderRadius: '14px', flex: 1 }} elevation={0}>
                        <Typography variant="body2">{copy.widget.msg3}</Typography>
                      </Paper>
                    </Stack>
                  </Stack>
                  <Divider />
                  <Box sx={{ p: 1.5 }}>
                    <Paper variant="outlined" sx={{ px: 1.5, py: 1, borderRadius: '999px' }}>
                      <Typography variant="caption" color="text.secondary">
                        {copy.widget.inputPlaceholder}
                      </Typography>
                    </Paper>
                  </Box>
                </Paper>
                {copy.widget.socialProof ? (
                  <Typography variant="caption" color="text.secondary" display="block" textAlign="center" sx={{ mt: 1.5 }}>
                    {copy.widget.socialProof}
                  </Typography>
                ) : null}
              </Grid>
            </Grid>
          </Paper>
        </Container>
      </section>

      {/* TESTIMONIALS */}
      <section className="landing-section landing-section--soft">
        <Container maxWidth="lg">
          <div className="landing-section__head">
            <h2 className="landing-section-title" style={{ margin: '0 0 0.75rem' }}>
              {copy.testimonials.title}
            </h2>
            <p className="landing-lead" style={{ margin: '0 auto' }}>
              {copy.testimonials.subtitle}
            </p>
          </div>
          <div className="landing-quote-grid">
            {copy.testimonials.items.map((item, i) => (
              <article key={item.author} className="landing-quote">
                <p className="landing-quote__text">&ldquo;{item.quote}&rdquo;</p>
                <div className="landing-quote__person">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="landing-quote__avatar"
                    src={TESTIMONIAL_PHOTOS[i % TESTIMONIAL_PHOTOS.length]}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                  />
                  <div>
                    <Typography sx={{ fontWeight: 650, fontSize: '0.875rem', letterSpacing: '-0.02em' }}>
                      {item.author}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.role} · {item.company}
                    </Typography>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* TRAINING */}
      <section id="training" className="landing-section">
        <Container maxWidth="md">
          <div className="landing-section__head">
            <span className="landing-eyebrow">{copy.training.badge}</span>
            <h2 className="landing-section-title" style={{ margin: '1rem 0 0.75rem' }}>
              {copy.training.title}
            </h2>
            <p className="landing-lead" style={{ margin: '0 auto' }}>
              {copy.training.subtitle}
            </p>
          </div>
          <Grid container spacing={1.25}>
            {copy.training.steps.map((s) => (
              <Grid key={s.step} size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    height: '100%',
                    p: 2.25,
                    borderRadius: '18px',
                    border: '1px solid rgba(15,23,42,0.08)',
                    bgcolor: '#fff',
                  }}
                >
                  <Typography
                    sx={{
                      mb: 0.75,
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: s.color,
                    }}
                  >
                    {s.step}
                  </Typography>
                  <h3 className="landing-card-title" style={{ margin: '0 0 0.55rem' }}>
                    {s.title}
                  </h3>
                  <p className="landing-body-sm" style={{ margin: 0 }}>
                    {s.desc}
                  </p>
                </Box>
              </Grid>
            ))}
          </Grid>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center" alignItems="center" sx={{ mt: 3.5 }}>
            <span className="landing-eyebrow">{copy.training.included}</span>
            <Button
              className="landing-btn"
              component="a"
              href={buildTrainingWhatsAppUrl()}
              target={SALES_WHATSAPP_LINK_PROPS.target}
              rel={SALES_WHATSAPP_LINK_PROPS.rel}
              variant="contained"
              endIcon={<ArrowForwardIcon size={16} />}
              sx={{ borderRadius: 999 }}
            >
              {copy.training.cta}
            </Button>
          </Stack>
        </Container>
      </section>

      {/* CTA */}
      <section className="landing-section" style={{ textAlign: 'center' }}>
        <Container maxWidth="sm">
          <h2 className="landing-section-title" style={{ margin: '0 0 0.85rem' }}>
            {copy.cta.title1}{' '}
            <span className="landing-accent">{copy.cta.title2}</span>
          </h2>
          <p className="landing-lead" style={{ margin: '0 auto 1.75rem' }}>
            {copy.cta.subtitle}
          </p>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
            <Button
              className="landing-btn"
              component={Link}
              href="/pricing"
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon size={18} />}
              sx={{ borderRadius: 999, px: 2.75 }}
            >
              {copy.cta.primary}
            </Button>
            <Button
              className="landing-btn"
              component={Link}
              href="/login"
              variant="outlined"
              size="large"
              color="inherit"
              sx={{ borderRadius: 999, px: 2.75, borderColor: 'rgba(15,23,42,0.12)' }}
            >
              {copy.cta.secondary}
            </Button>
          </Stack>
        </Container>
      </section>

      <LandingFooter />
    </Box>
  );
}
