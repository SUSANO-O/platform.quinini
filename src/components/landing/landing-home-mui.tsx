'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Container,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Stack,
  Typography,
  Avatar,
  Paper,
  Divider,
} from '@mui/material';
import {
  ChevronDown as ExpandMoreIcon,
  ArrowRight as ArrowForwardIcon,
  CheckCircle as CheckCircleOutlineIcon,
  Star as StarIcon,
} from '@/components/ui/icons';
import { LandingNavbar } from '@/components/landing/landing-navbar';
import { LandingFooter } from '@/components/landing/landing-footer';
import { LandingIcon } from '@/components/landing/landing-icon';
import { HowStepMock } from '@/components/landing/how-step-mock';
import type { LandingIconName } from '@/lib/landing-icons';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';
import { BRAND } from '@/lib/brand-colors';
import {
  buildTrainingWhatsAppUrl,
  SALES_WHATSAPP_LINK_PROPS,
} from '@/lib/sales-whatsapp';

export type LandingCopy = {
  badge: string;
  hero: { title1: string; title2: string; description: string; ctaPrimary: string; ctaAccount: string };
  productStrip: { agents: string; agentsDesc: string; widget: string; widgetDesc: string; panel: string; panelDesc: string; api: string; apiDesc: string };
  how: { badge: string; title: string; subtitle: string; steps: { title: string; desc: string; icon: LandingIconName; accent: string; variant: 1 | 2 | 3 | 4 | 5 }[] };
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
  faq: { title: string; items: { q: string; a: string }[] };
  cta: { title1: string; title2: string; subtitle: string; primary: string; secondary: string };
};

const R = BRAND.primary;

export function LandingHomeMui({ copy }: { copy: LandingCopy }) {
  const strip = [
    { k: copy.productStrip.agents, d: copy.productStrip.agentsDesc },
    { k: copy.productStrip.widget, d: copy.productStrip.widgetDesc },
    { k: copy.productStrip.panel, d: copy.productStrip.panelDesc },
    { k: copy.productStrip.api, d: copy.productStrip.apiDesc },
  ];

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 60% 40% at 10% 0%, ${BRAND.primary}18, transparent 55%),
            radial-gradient(ellipse 50% 35% at 90% 8%, ${BRAND.tertiary}14, transparent 50%),
            radial-gradient(ellipse 40% 30% at 50% 40%, ${BRAND.primaryLight}10, transparent 60%)
          `,
        }}
      />

      <LandingNavbar />

      {/* HERO */}
      <Box component="section" sx={{ pt: { xs: 12, md: 14 }, pb: { xs: 8, md: 10 }, position: 'relative' }}>
        <Container maxWidth="md" sx={{ textAlign: 'center' }}>
          <Stack alignItems="center" spacing={2} sx={{ mb: 3 }}>
            <Image
              src={BRAND_LOGO_SRC}
              alt={BRAND_NAME}
              width={160}
              height={48}
              style={{ height: 48, width: 'auto', objectFit: 'contain', borderRadius: 12 }}
              priority
            />
            <Typography variant="h3" color="primary" sx={{ fontSize: { xs: '2.6rem', md: '3.75rem' }, lineHeight: 0.95, letterSpacing: '-0.04em', fontWeight: 800, m: 0, textWrap: 'balance' }}>
              {BRAND_NAME}
            </Typography>
          </Stack>

          <Chip label={copy.badge} color="primary" variant="outlined" sx={{ mb: 2.5, fontWeight: 700, letterSpacing: '0.06em' }} />

          <Typography variant="h1" sx={{ mb: 2, textWrap: 'balance' }}>
            {copy.hero.title1}
            <br />
            <Box component="span" sx={{ color: 'primary.main' }}>
              {copy.hero.title2}
            </Box>
          </Typography>

          <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500, fontSize: { xs: '1.05rem', md: '1.2rem' }, lineHeight: 1.6, letterSpacing: '-0.014em', maxWidth: 640, mx: 'auto', mb: 3.5, textWrap: 'pretty' }}>
            {copy.hero.description}
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center" sx={{ mb: 5 }}>
            <Button component={Link} href="/pricing" variant="contained" size="large" endIcon={<ArrowForwardIcon size={18} />}>
              {copy.hero.ctaPrimary}
            </Button>
            <Button component={Link} href="/login" variant="outlined" size="large" color="inherit">
              {copy.hero.ctaAccount}
            </Button>
          </Stack>

          <Grid container spacing={1.5}>
            {strip.map((item) => (
              <Grid key={item.k} size={{ xs: 6, sm: 3 }}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%', textAlign: 'left', bgcolor: 'rgba(0,107,125,0.04)' }}>
                  <Typography variant="subtitle2" color="primary" sx={{ textWrap: 'balance' }} fontWeight={700}>
                    {item.k}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.d}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* HOW */}
      <Box component="section" sx={{ py: { xs: 8, md: 10 }, position: 'relative' }}>
        <Container maxWidth="lg">
          <Stack alignItems="center" spacing={1.5} sx={{ mb: 5, textAlign: 'center' }}>
            <Chip label={copy.how.badge} variant="outlined" color="primary" sx={{ textWrap: 'balance' }} />
            <Typography variant="h2">
              {copy.how.title}
            </Typography>
            <Typography color="text.secondary" maxWidth={720}>
              {copy.how.subtitle}
            </Typography>
          </Stack>

          <Grid container spacing={2.5}>
            {copy.how.steps.map((s, idx) => (
              <Grid key={s.title} size={{ xs: 12, md: 6, lg: 4 }}>
                <Card sx={{ height: '100%', borderTop: `3px solid ${s.accent}` }}>
                  <CardContent>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
                      <Avatar sx={{ bgcolor: `${s.accent}18`, color: s.accent, width: 48, height: 48 }}>
                        <LandingIcon name={s.icon} size="lg" />
                      </Avatar>
                      <Box>
                        <Typography variant="overline" color="text.secondary">
                          0{idx + 1}
                        </Typography>
                        <Typography variant="h6">{s.title}</Typography>
                      </Box>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {s.desc}
                    </Typography>
                    <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                      <HowStepMock variant={s.variant} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* AGENTS */}
      <Box id="agents" component="section" sx={{ py: { xs: 8, md: 10 } }}>
        <Container maxWidth="lg">
          <Stack alignItems="center" spacing={1.5} sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h2" color="primary" sx={{ textWrap: 'balance' }}>
              {copy.agents.title}
            </Typography>
            <Typography color="text.secondary" maxWidth={720}>
              {copy.agents.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2}>
            {copy.agents.items.map((a) => (
              <Grid key={a.slug} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Card sx={{ height: '100%', borderColor: `${a.color}40` }}>
                  <CardActionArea component={Link} href={`/agents/${a.slug}`} sx={{ height: '100%', alignItems: 'stretch' }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                        <Avatar sx={{ bgcolor: `${a.color}16`, color: a.color, width: 56, height: 56 }}>
                          <LandingIcon name={a.icon} size="2xl" />
                        </Avatar>
                        <Chip size="small" label={a.focus} sx={{ bgcolor: `${a.color}12`, color: a.color }} />
                      </Stack>
                      <Typography variant="h6" gutterBottom>
                        {a.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {a.desc}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* FEATURES */}
      <Box component="section" sx={{ py: { xs: 8, md: 10 } }}>
        <Container maxWidth="lg">
          <Stack alignItems="center" spacing={1.5} sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h2">
              {copy.features.title}
            </Typography>
            <Typography color="text.secondary">{copy.features.subtitle}</Typography>
          </Stack>
          <Grid container spacing={2}>
            {copy.features.items.map((f) => (
              <Grid key={f.title} size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: '100%', borderTop: `3px solid ${f.color}` }}>
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
                      <Avatar sx={{ bgcolor: `${f.color}16`, color: f.color }}>
                        <LandingIcon name={f.icon} size="xl" />
                      </Avatar>
                      <Chip size="small" label={f.metric} sx={{ bgcolor: `${f.color}12`, color: f.color }} />
                    </Stack>
                    <Typography variant="h6" gutterBottom>
                      {f.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {f.desc}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* WIDGET */}
      <Box component="section" sx={{ py: { xs: 8, md: 10 } }}>
        <Container maxWidth="md">
          <Stack alignItems="center" spacing={1.5} sx={{ mb: 4, textAlign: 'center' }}>
            <Chip label={copy.widget.badge} color="primary" sx={{ textWrap: 'balance' }} variant="outlined" />
            <Typography variant="h2">
              {copy.widget.title}
            </Typography>
            <Typography color="text.secondary" maxWidth={560}>
              {copy.widget.subtitle}
            </Typography>
          </Stack>

          <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ef4444' }} />
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f59e0b' }} />
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#22c55e' }} />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, fontFamily: 'monospace' }}>
                {copy.widget.windowTitle}
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Chip size="small" color="success" label={copy.widget.live} />
              <Button component={Link} href="/pricing" size="small" variant="contained">
                {copy.widget.startFree}
              </Button>
            </Stack>

            <Grid container spacing={3} sx={{ p: { xs: 2, md: 3 } }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="overline" color="text.secondary">
                  {copy.widget.whyTitle}
                </Typography>
                <Stack spacing={2} sx={{ mt: 1.5 }}>
                  {copy.widget.benefits.map((b) => (
                    <Stack key={b.title} direction="row" spacing={1.5} alignItems="flex-start">
                      <CheckCircleOutlineIcon size={18} style={{ color: b.color, marginTop: 2 }} />
                      <Box>
                        <Typography variant="subtitle2">{b.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {b.desc}
                        </Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="overline" color="text.secondary">
                  {copy.widget.chatSampleTitle}
                </Typography>
                <Paper variant="outlined" sx={{ mt: 1.5, overflow: 'hidden' }}>
                  <Box sx={{ bgcolor: R, color: '#fff', px: 2, py: 1.5 }}>
                    <Typography variant="subtitle2">{copy.widget.assistantName}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.8 }}>
                      {copy.widget.available}
                    </Typography>
                  </Box>
                  <Stack spacing={1.5} sx={{ p: 2, bgcolor: 'background.default', minHeight: 180 }}>
                    <Paper sx={{ p: 1.25, alignSelf: 'flex-start', maxWidth: '85%' }} elevation={0}>
                      <Typography variant="body2">{copy.widget.msg1}</Typography>
                    </Paper>
                    <Paper sx={{ p: 1.25, alignSelf: 'flex-end', maxWidth: '80%', bgcolor: R, color: '#fff' }} elevation={0}>
                      <Typography variant="body2">{copy.widget.msg2}</Typography>
                    </Paper>
                    <Paper sx={{ p: 1.25, alignSelf: 'flex-start', maxWidth: '85%' }} elevation={0}>
                      <Typography variant="body2">{copy.widget.msg3}</Typography>
                    </Paper>
                  </Stack>
                  <Divider />
                  <Stack direction="row" spacing={1} sx={{ p: 1.5 }} alignItems="center">
                    <Paper variant="outlined" sx={{ flex: 1, px: 1.5, py: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {copy.widget.inputPlaceholder}
                      </Typography>
                    </Paper>
                    <Avatar sx={{ bgcolor: R, width: 32, height: 32 }}>
                      <ArrowForwardIcon size={16} />
                    </Avatar>
                  </Stack>
                </Paper>
                <Typography variant="caption" color="text.secondary" display="block" textAlign="center" sx={{ mt: 1.5 }}>
                  {copy.widget.socialProof}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Container>
      </Box>

      {/* TESTIMONIALS */}
      <Box component="section" sx={{ py: { xs: 8, md: 10 } }}>
        <Container maxWidth="lg">
          <Stack alignItems="center" spacing={1.5} sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h2">
              {copy.testimonials.title}
            </Typography>
            <Typography color="text.secondary">{copy.testimonials.subtitle}</Typography>
          </Stack>
          <Grid container spacing={2}>
            {copy.testimonials.items.map((item, i) => {
              const accent = [BRAND.primary, BRAND.primaryLight, BRAND.tertiary][i % 3];
              return (
                <Grid key={item.author} size={{ xs: 12, md: 4 }}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Stack direction="row" spacing={0.25} sx={{ mb: 1.5 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <StarIcon key={n} size={18} style={{ color: accent }} fill="currentColor" />
                        ))}
                      </Stack>
                      <Typography variant="body2" sx={{ mb: 2.5 }}>
                        &ldquo;{item.quote}&rdquo;
                      </Typography>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar sx={{ bgcolor: accent }}>{item.author.charAt(0)}</Avatar>
                        <Box>
                          <Typography variant="subtitle2">{item.author}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.role} · {item.company}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Container>
      </Box>

      {/* TRAINING */}
      <Box id="training" component="section" sx={{ py: { xs: 8, md: 10 } }}>
        <Container maxWidth="md">
          <Stack alignItems="center" spacing={1.5} sx={{ mb: 4, textAlign: 'center' }}>
            <Chip label={copy.training.badge} color="secondary" variant="outlined" />
            <Typography variant="h2">
              {copy.training.title}
            </Typography>
            <Typography color="text.secondary" maxWidth={640}>
              {copy.training.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2}>
            {copy.training.steps.map((s) => (
              <Grid key={s.step} size={{ xs: 12, sm: 6 }}>
                <Card sx={{ height: '100%', borderTop: `3px solid ${s.color}` }}>
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="flex-start">
                      <Avatar sx={{ bgcolor: s.color, width: 52, height: 52 }}>
                        <LandingIcon name={s.icon} size="xl" className="text-white" />
                      </Avatar>
                      <Box>
                        <Typography variant="h6">{s.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {s.desc}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center" sx={{ mt: 4 }}>
            <Chip color="primary" sx={{ textWrap: 'balance' }} variant="outlined" label={copy.training.included} />
            <Button
              component="a"
              href={buildTrainingWhatsAppUrl()}
              target={SALES_WHATSAPP_LINK_PROPS.target}
              rel={SALES_WHATSAPP_LINK_PROPS.rel}
              variant="contained"
              endIcon={<ArrowForwardIcon size={18} />}
            >
              {copy.training.cta}
            </Button>
          </Stack>
        </Container>
      </Box>

      {/* FAQ */}
      <Box component="section" sx={{ py: { xs: 8, md: 10 } }}>
        <Container maxWidth="sm">
          <Typography variant="h2" textAlign="center" sx={{ mb: 3, textWrap: 'balance' }}>
            {copy.faq.title}
          </Typography>
          {copy.faq.items.map((faq) => (
            <Accordion key={faq.q} disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 1, '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon size={22} />}>
                <Typography fontWeight={600}>{faq.q}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography color="text.secondary">{faq.a}</Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Container>
      </Box>

      {/* CTA */}
      <Box component="section" sx={{ py: { xs: 8, md: 10 }, textAlign: 'center' }}>
        <Container maxWidth="sm">
          <Typography variant="h2" sx={{ mb: 2, textWrap: 'balance' }}>
            {copy.cta.title1}
            <br />
            <Box component="span" color="primary.main">
              {copy.cta.title2}
            </Box>
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {copy.cta.subtitle}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
            <Button component={Link} href="/pricing" variant="contained" size="large" endIcon={<ArrowForwardIcon size={18} />}>
              {copy.cta.primary}
            </Button>
            <Button component={Link} href="/login" variant="outlined" size="large" color="inherit">
              {copy.cta.secondary}
            </Button>
          </Stack>
        </Container>
      </Box>

      <LandingFooter />
    </Box>
  );
}
