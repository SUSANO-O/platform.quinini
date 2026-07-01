/** WhatsApp comercial BotIvA (ventas / activación de plan). */
export const SALES_WHATSAPP_DISPLAY = '+57 313 3174629';

export const SALES_WHATSAPP_DIGITS = '573133174629';

function waMeUrl(text: string): string {
  return `https://wa.me/${SALES_WHATSAPP_DIGITS}?text=${encodeURIComponent(text)}`;
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
