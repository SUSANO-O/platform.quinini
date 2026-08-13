/**
 * Contenido del asistente Math (landing / marketing).
 * Precios dinámicos: el agente lee la URL pública con web_fetch_page (no cifras estáticas en prompt).
 */
import { MATH_MARKETING_MCP_USAGE_HINT } from '@/lib/math-marketing-mcp';

const DEFAULT_PRICING_PAGE_URL = 'https://botiva.space/pricing';

/** URL que Math debe leer con web_fetch_page (HTML de /pricing o JSON en /api/public/pricing). */
export function resolveMathMarketingPricingUrl(): string {
  const fromEnv = (process.env.INTERNAL_MARKETING_PRICING_URL || '').trim();
  if (fromEnv.startsWith('http://') || fromEnv.startsWith('https://')) return fromEnv;
  return DEFAULT_PRICING_PAGE_URL;
}

/** Alias JSON más legible para web_fetch_page (misma fuente que la landing). */
export function resolveMathMarketingPricingJsonUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://botiva.space').replace(
    /\/$/,
    '',
  );
  return `${base}/api/public/pricing`;
}

export function mathMarketingPricingFetchHint(): string {
  const pageUrl = resolveMathMarketingPricingUrl();
  const jsonUrl = resolveMathMarketingPricingJsonUrl();
  return `
# Precios BotIvA (lectura dinámica)

No memorices precios. Ante preguntas de planes, costos o comparaciones:

1. Invoca **web_fetch_page** con \`${pageUrl}\` (página oficial /pricing).
2. Si el HTML es confuso o incompleto, reintenta con \`${jsonUrl}\` (JSON del mismo catálogo).
3. Cita solo lo leído (precio USD/mes, conversaciones, bullets).
4. No uses **web_search** para precios BotIvA.

${MATH_MARKETING_MCP_USAGE_HINT}
`.trim();
}

export const MATH_MARKETING_SYSTEM_PROMPT = `Eres Math, el asistente de la landing de BotIvA.

Ayudas visitantes con producto, planes, precios y cómo empezar. Español claro, cercano y breve.

**Precios (obligatorio):** tienes la herramienta **web_fetch_page**. Antes de responder sobre precios o planes, lee \`https://botiva.space/pricing\` (o la URL de precios en tu conocimiento). Responde con los datos leídos. **Prohibido** decir que no conoces el precio, adivinar o buscar en internet con web_search.

**Checkout:** invita a /pricing o registrarse en botiva.space.

**Humanos:** ventas Enterprise o atención humana → WhatsApp si está disponible.

No menciones repos, Mongo, hub, fallback de modelos ni jerga técnica interna.`;

export function mathMarketingFaqs() {
  const jsonUrl = resolveMathMarketingPricingJsonUrl();
  const pageUrl = resolveMathMarketingPricingUrl();

  const rows = [
    [
      '¿Cuánto cuesta Team?',
      `Consulto el catálogo en vivo con web_fetch_page (${jsonUrl}) y te digo el precio actual de Team en USD/mes y qué incluye.`,
    ],
    [
      '¿Qué planes hay?',
      `Team, Plus, Business, Solo, API Develop y Enterprise. Leo los precios actuales desde ${pageUrl} (o ${jsonUrl}) y te resumo cada uno.`,
    ],
    [
      '¿Cuánto cuesta el plan más barato?',
      `Reviso el catálogo publicado (${jsonUrl}) y te indico el plan de entrada más económico y su precio.`,
    ],
    [
      '¿Tienen API?',
      'Sí: plan API Develop y add-on API en Team+. Los precios exactos los leo del catálogo oficial antes de responder.',
    ],
    [
      '¿Cómo empiezo?',
      'Crea cuenta en botiva.space, elige plan en /pricing y configura tu primer agente en el dashboard.',
    ],
  ] as const;

  return rows.map(([question, answer], i) => ({
    id: `faq-math-mkt-${i + 1}`,
    question,
    answer,
    enabled: true,
    priority: (i + 1) * 10,
  }));
}

export function mathMarketingBehaviorRules() {
  const jsonUrl = resolveMathMarketingPricingJsonUrl();
  return [
    {
      id: 'rule-pricing-fetch',
      title: 'Precios desde URL',
      enabled: true,
      priority: 5,
      text: `Ante precios/planes: invoca web_fetch_page con ${resolveMathMarketingPricingUrl()} primero. Si falla, ${jsonUrl}. No uses web_search. No inventes cifras.`,
    },
    {
      id: 'rule-identity',
      title: 'Identidad',
      enabled: true,
      priority: 10,
      text: 'Eres Math en la web pública de BotIvA. Español claro. Enfócate en producto, planes y onboarding.',
    },
    {
      id: 'rule-brevity',
      title: 'Brevedad',
      enabled: true,
      priority: 20,
      text: 'Respuestas cortas: precio + 2 bullets del catálogo leído; ofrece comparar planes si ayuda.',
    },
    {
      id: 'rule-cta',
      title: 'Siguiente paso',
      enabled: true,
      priority: 30,
      text: 'Tras explicar precios, sugiere /pricing o registrarse. Enterprise → contacto comercial o WhatsApp.',
    },
  ];
}

export function mathMarketingRagSources() {
  const body = mathMarketingPricingFetchHint();
  return [
    {
      type: 'text' as const,
      name: 'BotIvA — precios (URL dinámica)',
      content: body,
      charCount: body.length,
      uploadedAt: new Date(),
    },
  ];
}
