/** WhatsApp comercial BotIvA (ventas / activación de plan). */
export const SALES_WHATSAPP_DISPLAY = '+57 313 3174629';

export const SALES_WHATSAPP_DIGITS = '573133174629';

/** Atributos estándar para enlaces externos a WhatsApp. */
export const SALES_WHATSAPP_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

function waMeUrl(text: string): string {
  return `https://wa.me/${SALES_WHATSAPP_DIGITS}?text=${encodeURIComponent(text)}`;
}

/** CTA genérico «Ver precios» / consulta comercial. */
export function buildPricingInquiryWhatsAppUrl(): string {
  return waMeUrl(
    'Hola, me interesa conocer los planes y precios de BotIvA. ¿Me pueden dar más información?',
  );
}

/** CTA genérico «Contáctanos» con contexto opcional. */
export function buildContactWhatsAppUrl(context?: string): string {
  const intro = 'Hola, me gustaría contactar con BotIvA';
  return waMeUrl(context ? `${intro} sobre ${context}.` : `${intro}.`);
}

/** CTA de acompañamiento / capacitación. */
export function buildTrainingWhatsAppUrl(): string {
  return waMeUrl(
    'Hola, me interesa empezar con el acompañamiento de BotIvA. ¿Cómo puedo agendar?',
  );
}

export function buildPlanWhatsAppUrl(planName: string, priceLabel?: string): string {
  const pricePart = priceLabel ? ` (${priceLabel})` : '';
  return waMeUrl(
    `Hola, me interesa el plan ${planName}${pricePart}. Quiero adquirirlo o recibir más información.`,
  );
}

export function buildTrialExpiredWhatsAppUrl(planName: string, priceLabel?: string): string {
  const pricePart = priceLabel ? ` (${priceLabel})` : '';
  return waMeUrl(
    `Hola, mi suscripción de BotIvA expiró y quiero contratar el plan ${planName}${pricePart}. ¿Me ayudan a activarlo?`,
  );
}
