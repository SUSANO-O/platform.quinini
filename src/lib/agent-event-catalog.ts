/**
 * Catálogo de eventos (UI landing) — mantener en sync con
 * `matias-backend/src/lib/agent-event-catalog.ts` (sección AGENT_EVENT_CATALOG + helpers UI).
 */

export const EVENT_LEAD_CAPTURED = 'lead_captured';
export const EVENT_LEAD_CREATED = 'lead_created';
export const EVENT_CRM_LOOKUP = 'crm_lookup';
export const EVENT_CRM_DEAL = 'crm_deal';
export const EVENT_CRM_CONTACT_CREATED = 'crm_contact_created';
export const EVENT_CRM_CONTACT_UPDATED = 'crm_contact_updated';
export const EVENT_MESSAGE_SEND = 'message_send';
export const EVENT_MESSAGE_SEARCH = 'message_search';
export const EVENT_INVENTORY_LOOKUP = 'inventory_lookup';
export const EVENT_INVENTORY_UPDATED = 'inventory_updated';
export const EVENT_CONVERSATION_STARTED = 'conversation_started';
export const EVENT_CONVERSATION_ENDED = 'conversation_ended';
export const EVENT_HUMAN_HANDOFF = 'human_handoff_requested';
export const EVENT_VISITOR_FEEDBACK = 'visitor_feedback';
export const EVENT_SCHEDULED_TASK_OK = 'scheduled_task_completed';
export const EVENT_SCHEDULED_TASK_FAIL = 'scheduled_task_failed';
export const EVENT_INTEGRATION_ERROR = 'integration_error';
export const EVENT_WEB_SEARCH = 'web_search';
export const EVENT_WEATHER_LOOKUP = 'weather_lookup';

export type AgentEventOwner = 'server' | 'llm';
export type AgentEventCategory =
  | 'lead'
  | 'crm'
  | 'messaging'
  | 'data'
  | 'conversation'
  | 'automation'
  | 'integration';
export type AgentEventStatus = 'active' | 'planned';

export type AgentEventDefinition = {
  id: string;
  label: string;
  description: string;
  owner: AgentEventOwner;
  category: AgentEventCategory;
  webhookSubscribable: boolean;
  status: AgentEventStatus;
  aliases?: string[];
  uiHidden?: boolean;
};

export const AGENT_EVENT_CATALOG: readonly AgentEventDefinition[] = [
  {
    id: EVENT_LEAD_CAPTURED,
    label: 'Captura de lead',
    description:
      'El visitante deja email o celular en el chat. El servidor registra el lead (CRM + webhooks suscritos) sin que el agente orqueste destinos.',
    owner: 'server',
    category: 'lead',
    webhookSubscribable: true,
    status: 'active',
    aliases: [EVENT_LEAD_CREATED],
  },
  {
    id: EVENT_CRM_CONTACT_CREATED,
    label: 'Contacto creado en CRM',
    description: 'Se creó un contacto en HubSpot u otro CRM conectado (fuera del fan-out automático de lead).',
    owner: 'llm',
    category: 'crm',
    webhookSubscribable: true,
    status: 'planned',
  },
  {
    id: EVENT_CRM_CONTACT_UPDATED,
    label: 'Contacto actualizado en CRM',
    description: 'Se actualizaron datos de un contacto existente en el CRM.',
    owner: 'llm',
    category: 'crm',
    webhookSubscribable: true,
    status: 'planned',
  },
  {
    id: EVENT_CRM_DEAL,
    label: 'Deal / negocio creado',
    description: 'Se registró un negocio o deal en el CRM (p. ej. HubSpot create_deal).',
    owner: 'llm',
    category: 'crm',
    webhookSubscribable: true,
    status: 'planned',
  },
  {
    id: EVENT_MESSAGE_SEND,
    label: 'Correo enviado',
    description: 'El agente envió un email (Gmail u otro conector de mensajería).',
    owner: 'llm',
    category: 'messaging',
    webhookSubscribable: true,
    status: 'planned',
  },
  {
    id: EVENT_INVENTORY_UPDATED,
    label: 'Inventario actualizado',
    description: 'Escritura o append en hoja de cálculo / inventario.',
    owner: 'llm',
    category: 'data',
    webhookSubscribable: true,
    status: 'planned',
  },
  {
    id: EVENT_CONVERSATION_STARTED,
    label: 'Conversación iniciada',
    description: 'Primera interacción del visitante en una sesión del widget.',
    owner: 'server',
    category: 'conversation',
    webhookSubscribable: true,
    status: 'planned',
  },
  {
    id: EVENT_CONVERSATION_ENDED,
    label: 'Conversación cerrada',
    description: 'El visitante cerró el chat o la sesión expiró.',
    owner: 'server',
    category: 'conversation',
    webhookSubscribable: true,
    status: 'planned',
  },
  {
    id: EVENT_HUMAN_HANDOFF,
    label: 'Escalación a humano',
    description: 'El visitante pidió hablar con una persona o derivación a soporte.',
    owner: 'server',
    category: 'conversation',
    webhookSubscribable: true,
    status: 'planned',
  },
  {
    id: EVENT_VISITOR_FEEDBACK,
    label: 'Feedback del visitante',
    description: 'Valoración o comentario explícito al cierre de la conversación.',
    owner: 'server',
    category: 'conversation',
    webhookSubscribable: true,
    status: 'planned',
  },
  {
    id: EVENT_SCHEDULED_TASK_OK,
    label: 'Tarea programada completada',
    description: 'Un cron / tarea programada del agente terminó con éxito.',
    owner: 'server',
    category: 'automation',
    webhookSubscribable: true,
    status: 'planned',
  },
  {
    id: EVENT_SCHEDULED_TASK_FAIL,
    label: 'Tarea programada fallida',
    description: 'Un cron / tarea programada falló o devolvió error.',
    owner: 'server',
    category: 'automation',
    webhookSubscribable: true,
    status: 'planned',
  },
  {
    id: EVENT_INTEGRATION_ERROR,
    label: 'Error de integración',
    description: 'Fallo al llamar CRM, webhook, MCP u otro conector externo.',
    owner: 'server',
    category: 'integration',
    webhookSubscribable: true,
    status: 'planned',
  },
];

const catalogById = new Map<string, AgentEventDefinition>();
for (const def of AGENT_EVENT_CATALOG) {
  catalogById.set(def.id, def);
  for (const alias of def.aliases ?? []) {
    if (!catalogById.has(alias)) catalogById.set(alias, def);
  }
}

export function normalizeEventId(raw: string): string {
  const id = raw.trim().toLowerCase();
  if (!id) return id;
  return catalogById.get(id)?.id ?? id;
}

export function getEventDefinition(eventId: string): AgentEventDefinition | undefined {
  const norm = normalizeEventId(eventId);
  return catalogById.get(norm);
}

export function isEventActive(eventId: string): boolean {
  return getEventDefinition(eventId)?.status === 'active';
}

export function isServerOwnedEvent(eventId: string): boolean {
  return getEventDefinition(eventId)?.owner === 'server';
}

const CATEGORY_LABELS: Record<AgentEventCategory, string> = {
  lead: 'Lead y ventas',
  crm: 'CRM',
  messaging: 'Mensajería',
  data: 'Datos e inventario',
  conversation: 'Conversación',
  automation: 'Automatización',
  integration: 'Integraciones',
};

export function webhookEventCatalogForUi(): Array<{
  category: AgentEventCategory;
  categoryLabel: string;
  events: AgentEventDefinition[];
}> {
  const groups = new Map<AgentEventCategory, AgentEventDefinition[]>();
  for (const def of AGENT_EVENT_CATALOG) {
    if (!def.webhookSubscribable || def.uiHidden) continue;
    const list = groups.get(def.category) ?? [];
    list.push(def);
    groups.set(def.category, list);
  }
  const order: AgentEventCategory[] = [
    'lead',
    'crm',
    'messaging',
    'data',
    'conversation',
    'automation',
    'integration',
  ];
  return order
    .filter((c) => groups.has(c))
    .map((category) => ({
      category,
      categoryLabel: CATEGORY_LABELS[category],
      events: groups.get(category)!,
    }));
}
