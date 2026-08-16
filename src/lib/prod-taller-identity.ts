/** Identidad de producto del preview 6a03a54c: taller de servicio, no concesionario. */

export const PROD_TALLER_NAME = 'Asesor de Taller';
export const PROD_TALLER_WIDGET_NAME = 'Asesor Taller';
export const PROD_TALLER_SUBTITLE = 'Servicio y citas';
export const PROD_TALLER_WELCOME =
  'Hola, soy tu asesor de taller. ¿Necesitas una revisión, un mantenimiento o agendar una cita de servicio?';

export const SALES_SKILL_IDS = ['sales_closer', 'objection_handling'] as const;

const SALES_FAQ_RE =
  /financi|cr[eé]dito|cuota|test\s*drive|prueba de (?:manejo|ruta)|comprar|venta|usado|retoma|permuta|concesion|inventario premium|picanto|suv/i;

export function isSalesFaqQuestion(question: string): boolean {
  return SALES_FAQ_RE.test(String(question || ''));
}

export function stripSalesSkills(ids: string[] | undefined | null): string[] {
  const ban = new Set<string>(SALES_SKILL_IDS);
  return (ids ?? []).filter((id) => !ban.has(String(id)));
}

export function stripSalesSkillsConfig<T extends { id?: string; skillId?: string }>(
  rows: T[] | undefined | null,
): T[] {
  const ban = new Set<string>(SALES_SKILL_IDS);
  return (rows ?? []).filter((row) => {
    const id = String(row?.id || row?.skillId || '');
    return !ban.has(id);
  });
}

export function stripSalesFaqs<T extends { question?: string }>(rows: T[] | undefined | null): T[] {
  return (rows ?? []).filter((row) => !isSalesFaqQuestion(String(row?.question || '')));
}

export const PROD_TALLER_SHORTCUTS: Array<{
  id: string;
  label: string;
  message: string;
  emoji: string;
  enabled: boolean;
}> = [
  {
    id: 'sc-taller-ruido',
    label: 'Ruido o falla',
    message:
      'El carro hace un ruido raro o se siente una falla. ¿Qué me recomiendas revisar y si debo llevarlo al taller?',
    emoji: '🔧',
    enabled: true,
  },
  {
    id: 'sc-taller-aceite',
    label: 'Cambio de aceite',
    message: 'Quiero un cambio de aceite y mantenimiento. ¿Qué incluye y cómo agendo?',
    emoji: '🛢️',
    enabled: true,
  },
  {
    id: 'sc-taller-frenos',
    label: 'Frenos',
    message: 'Siento los frenos blandos o con chirrido. ¿Qué revisión hacen en el taller?',
    emoji: '🛑',
    enabled: true,
  },
  {
    id: 'sc-taller-cita',
    label: 'Agendar cita',
    message: 'Quiero agendar una cita de servicio en el taller.',
    emoji: '📅',
    enabled: true,
  },
  {
    id: 'sc-taller-bateria',
    label: 'Batería o no arranca',
    message: 'El carro no arranca o la batería está débil. ¿Qué debo hacer y pueden revisarlo hoy?',
    emoji: '🔋',
    enabled: true,
  },
];

export const PROD_TALLER_SYSTEM_PROMPT = `Eres el asesor de servicio de un taller automotriz. Ayudas con diagnóstico básico, mantenimiento y a agendar una cita de taller.

Qué haces:
- Escuchas el síntoma (ruido, frenos, aceite, luces, revisión) y orientas el siguiente paso de servicio.
- Si piden agendar, tomas nombre y un dato de contacto y usas las herramientas de CRM/webhook si están configuradas. No digas que ya quedó agendado o guardado si la herramienta no respondió OK.

Qué no haces:
- No vendes carros, planes de financiamiento, retoma, permuta ni test drive de un vehículo nuevo.
- No cites stock, SKU, sedes, pasillos ni precios de repuestos si no salieron de una herramienta o documento de este agente. Este taller no tiene catálogo de piezas conectado: no inventes inventario.
- No te presentes como vendedor ni como concesionario.

Si ya hay conversación, no saludes de nuevo. Responde solo a este turno. Tono profesional, cercano, en español.`;
