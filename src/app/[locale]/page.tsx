import { getTranslations } from 'next-intl/server';
import { LandingHomeMui, type LandingCopy } from '@/components/landing/landing-home-mui';
import type { LandingIconName } from '@/lib/landing-icons';
import { R, B, Rd, BRAND } from '@/lib/brand-colors';

const C = BRAND.primaryLight;
const W = BRAND.tertiary;

function plainCopy(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value.replace(/<\/?[a-zA-Z0-9]+>/g, '').trim() || fallback;
  }
  return fallback;
}

export default async function LandingPage() {
  const t = await getTranslations('landing');

  const TESTIMONIALS = t.raw('testimonials.items') as {
    quote: string;
    author: string;
    role: string;
    company: string;
  }[];

  const copy: LandingCopy = {
    badge: t('badge'),
    hero: {
      title1: t('hero.title1'),
      title2: t('hero.title2'),
      description: t('hero.description'),
      ctaPrimary: t('hero.ctaPrimary'),
      ctaAccount: t('hero.ctaAccount'),
    },
    productStrip: {
      agents: t('productStrip.agents'),
      agentsDesc: t('productStrip.agentsDesc'),
      widget: t('productStrip.widget'),
      widgetDesc: t('productStrip.widgetDesc'),
      panel: t('productStrip.panel'),
      panelDesc: t('productStrip.panelDesc'),
      api: t('productStrip.api'),
      apiDesc: t('productStrip.apiDesc'),
    },
    how: {
      badge: t('how.badge'),
      title: t('how.title'),
      subtitle: t('how.subtitle'),
      steps: [
        { title: t('how.step1Title'), desc: t('how.step1Desc'), icon: 'user-plus', accent: R, variant: 1 },
        { title: t('how.step2Title'), desc: t('how.step2Desc'), icon: 'brain', accent: C, variant: 2 },
        { title: t('how.step3Title'), desc: t('how.step3Desc'), icon: 'palette', accent: R, variant: 3 },
        { title: t('how.step4Title'), desc: t('how.step4Desc'), icon: 'terminal', accent: C, variant: 4 },
        { title: t('how.step5Title'), desc: t('how.step5Desc'), icon: 'rocket', accent: R, variant: 5 },
        { title: t('how.step6Title'), desc: t('how.step6Desc'), icon: 'users', accent: W, variant: 6 },
      ],
    },
    agents: {
      title: t('agents.title'),
      subtitle: t('agents.subtitle'),
      items: [
        { name: 'Smart Agriculture', desc: t('agents.agriculture'), icon: 'sprout', color: C, focus: 'Agro', slug: 'agriculture' },
        { name: 'Education AI', desc: t('agents.education'), icon: 'graduation-cap', color: W, focus: 'Educacion', slug: 'education' },
        { name: 'Geoeconomics', desc: t('agents.geoeconomics'), icon: 'trending-up', color: B, focus: 'Economia', slug: 'geoeconomics' },
      ],
    },
    features: {
      title: t('features.title'),
      subtitle: t('features.subtitle'),
      items: [
        { icon: 'shield', title: t('features.secureTitle'), desc: t('features.secureDesc'), color: Rd, metric: t('features.secureMetric') },
        { icon: 'bar-chart', title: t('features.analyticsTitle'), desc: t('features.analyticsDesc'), color: B, metric: t('features.analyticsMetric') },
        { icon: 'globe', title: t('features.multitenantTitle'), desc: t('features.multitenantDesc'), color: B, metric: t('features.multitenantMetric') },
      ],
    },
    widget: {
      badge: t('widget.badge'),
      title: t('widget.title'),
      subtitle: t('widget.subtitle'),
      windowTitle: t('widget.windowTitle'),
      live: t('widget.live'),
      startFree: t('widget.startFree'),
      whyTitle: t('widget.whyTitle'),
      chatSampleTitle: t('widget.chatSampleTitle'),
      assistantName: t('widget.assistantName'),
      available: t('widget.available'),
      msg1: t('widget.msg1'),
      msg2: t('widget.msg2'),
      msg3: plainCopy(t.raw('widget.msg3'), '…'),
      inputPlaceholder: t('widget.inputPlaceholder'),
      socialProof: plainCopy(t.raw('widget.socialProof'), ''),
      benefits: [
        { color: R, title: t('widget.b1Title'), desc: t('widget.b1Desc') },
        { color: C, title: t('widget.b2Title'), desc: t('widget.b2Desc') },
        { color: B, title: t('widget.b3Title'), desc: t('widget.b3Desc') },
        { color: Rd, title: t('widget.b4Title'), desc: t('widget.b4Desc') },
        { color: Rd, title: t('widget.b5Title'), desc: t('widget.b5Desc') },
      ],
    },
    testimonials: {
      title: t('testimonials.title'),
      subtitle: t('testimonials.subtitle'),
      items: TESTIMONIALS,
    },
    training: {
      badge: t('training.badge'),
      title: t('training.title'),
      subtitle: t('training.subtitle'),
      included: t('training.included'),
      cta: t('training.cta'),
      steps: [
        { step: '01', icon: 'users' as LandingIconName, color: R, title: t('training.step1Title'), desc: t('training.step1Desc') },
        { step: '02', icon: 'book-open' as LandingIconName, color: C, title: t('training.step2Title'), desc: t('training.step2Desc') },
        { step: '03', icon: 'rocket' as LandingIconName, color: B, title: t('training.step3Title'), desc: t('training.step3Desc') },
        { step: '04', icon: 'play-circle' as LandingIconName, color: Rd, title: t('training.step4Title'), desc: t('training.step4Desc') },
      ],
    },
    cta: {
      title1: t('cta.title1'),
      title2: t('cta.title2'),
      subtitle: t('cta.subtitle'),
      primary: t('cta.primary'),
      secondary: t('cta.secondary'),
    },
  };

  return <LandingHomeMui copy={copy} />;
}
