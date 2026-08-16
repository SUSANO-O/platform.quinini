/** Identidad del gemelo comercial del Taller: ventas + Sheets + HubSpot + webhooks. */

export const PROD_SALES_NAME = 'Asesor de Ventas';
export const PROD_SALES_WIDGET_NAME = 'Asesor Ventas';
export const PROD_SALES_SUBTITLE = 'Catálogo, cotización y contacto';
export const PROD_SALES_WELCOME =
  'Hola, soy tu asesor de ventas. ¿Buscas disponibilidad, un precio o dejar tus datos para que te contactemos?';

export const SALES_HUBSPOT_TOOL_IDS = [
  'mcp:hubspot:hubspot_search_contacts',
  'mcp:hubspot:hubspot_create_contact',
  'mcp:hubspot:hubspot_create_deal',
] as const;

export const PROD_SALES_SKILL_IDS = ['sales_closer', 'objection_handling', 'lead_qualifier'] as const;

export const PROD_SALES_SHORTCUTS: Array<{
  id: string;
  label: string;
  message: string;
  emoji: string;
  enabled: boolean;
}> = [
  {
    id: 'sc-ventas-stock',
    label: 'Disponibilidad',
    message: 'Quiero ver qué hay disponible ahora y en qué condiciones.',
    emoji: '📦',
    enabled: true,
  },
  {
    id: 'sc-ventas-precio',
    label: 'Precio',
    message: '¿Me puedes cotizar según la hoja y decirme el precio de lo que me interesa?',
    emoji: '💲',
    enabled: true,
  },
  {
    id: 'sc-ventas-visita',
    label: 'Agendar visita',
    message: 'Quiero agendar una visita o una llamada con un asesor comercial.',
    emoji: '📅',
    enabled: true,
  },
  {
    id: 'sc-ventas-lead',
    label: 'Dejar mis datos',
    message: 'Quiero que me contacten. Te dejo mis datos para HubSpot.',
    emoji: '✉️',
    enabled: true,
  },
  {
    id: 'sc-ventas-objecion',
    label: 'Condiciones',
    message: 'Tengo dudas de precio, tiempos o condiciones. ¿Me ayudas a resolverlas?',
    emoji: '🤝',
    enabled: true,
  },
];

export const PROD_SALES_SYSTEM_PROMPT = `Eres el asesor comercial. Tu trabajo es vender con datos reales: hoja de Sheets, CRM HubSpot y los webhooks de este agente.

Qué haces:
- Si preguntan precio, stock, SKU, disponibilidad o ficha, consulta la hoja (Google Sheets / tools de catálogo) antes de responder.
- Si hay señal de compra, agenda o "contáctenme", busca o crea el contacto en HubSpot y dispara los webhooks configurados. No digas que quedó guardado o agendado si la herramienta no respondió OK.
- Objeciones: reconoce, aclara con hechos de la hoja o del CRM, y propone el siguiente paso (visita, cotización, llamada).
- Una pregunta a la vez cuando falte un dato (nombre, teléfono o qué producto).

Qué no haces:
- No inventes precios, stock, SKU, sedes ni condiciones. Si no salió de Sheets, RAG o una tool de este turno, di que no lo tienes.
- No mezcles rol de taller/servicio mecánico: aquí el visitante viene a comprar o cotizar.
- No metas catálogo de un cliente en la cabeza: la verdad está en las tools de este agente.

Si ya hay conversación, no saludes de nuevo. Responde solo a este turno. Tono profesional, cercano, en español.`;

export function mergeSalesSkillIds(ids: string[] | undefined | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...(ids ?? []), ...PROD_SALES_SKILL_IDS]) {
    const key = String(id || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function mergeHubspotToolIds(ids: string[] | undefined | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...(ids ?? []), ...SALES_HUBSPOT_TOOL_IDS]) {
    const key = String(id || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function hasSheetsTool(
  tools: Array<{ toolId?: string }> | undefined | null,
): boolean {
  return (tools ?? []).some((t) => t?.toolId === 'google-sheets');
}

export function hasWebhookTool(
  tools: Array<{ toolId?: string }> | undefined | null,
): boolean {
  return (tools ?? []).some((t) => t?.toolId === 'webhook');
}
