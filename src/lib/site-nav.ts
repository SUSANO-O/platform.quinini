/** Enlaces compartidos entre navbar/footer de marketing (locale y páginas estáticas). */

import { buildPricingInquiryWhatsAppUrl } from '@/lib/sales-whatsapp';

const PRICING_WHATSAPP_URL = buildPricingInquiryWhatsAppUrl();

export const SITE_PRODUCT_LINKS = [
  { href: '/pricing#api-develop', label: 'API' },
  { href: PRICING_WHATSAPP_URL, label: 'Precios', external: true },
] as const;

export const SITE_COMPANY_LINKS = [
  { href: '/es#agents', label: 'Agentes' },
  { href: '/es#training', label: 'Capacitación' },
  { href: '/preguntas-frecuentes', label: 'FAQ' },
] as const;

export const SITE_LEGAL_LINKS = [
  { href: '/terminos-y-condiciones', label: 'Términos' },
  { href: '/politica-de-privacidad', label: 'Privacidad' },
  { href: '/politica-de-cookies', label: 'Cookies' },
  { href: '/politica-de-reembolso', label: 'Reembolsos' },
  { href: '/compliance', label: 'Tratamiento de datos' },
] as const;

export const SITE_NAV_LINKS = [
  { href: PRICING_WHATSAPP_URL, label: 'Precios', external: true },
  { href: '/preguntas-frecuentes', label: 'Preguntas frecuentes' },
] as const;
