/**
 * Catálogo de skills de agente.
 * Los IDs son la fuente de verdad; se sincronizan entre landing y hub.
 */

export type AgentSkill = {
  id: string;
  label: string;
  description: string;
  color: string;
};

export const AGENT_SKILLS: AgentSkill[] = [
  { id: 'web_search',          label: 'Búsqueda Web',           description: 'Busca y recupera información actualizada de internet',                    color: '#3b82f6' },
  { id: 'data_analysis',       label: 'Análisis de Datos',      description: 'Analiza datos, genera métricas y extrae insights',                        color: '#8b5cf6' },
  { id: 'report_generation',   label: 'Generación de Reportes', description: 'Crea reportes, informes y documentos estructurados',                       color: '#06b6d4' },
  { id: 'customer_service',    label: 'Atención al Cliente',    description: 'Responde consultas, soporte y gestión de tickets',                         color: '#22c55e' },
  { id: 'code_review',         label: 'Revisión de Código',     description: 'Revisa, analiza y sugiere mejoras en código fuente',                       color: '#f59e0b' },
  { id: 'document_summary',    label: 'Resumen de Documentos',  description: 'Resume y extrae información clave de documentos',                          color: '#ec4899' },
  { id: 'email_management',    label: 'Gestión de Correo',      description: 'Redacta, organiza y gestiona correos electrónicos (Gmail)',                 color: '#ef4444' },
  { id: 'calendar_management', label: 'Gestión de Calendario',  description: 'Crea y gestiona eventos en Google Calendar',                               color: '#14b8a6' },
  { id: 'crm_integration',     label: 'Integración CRM',        description: 'Opera con contactos y negocios en HubSpot CRM',                            color: '#f97316' },
  { id: 'maps_geolocation',    label: 'Mapas y Geolocalización', description: 'Geocodifica, busca lugares y calcula rutas con Google Maps',               color: '#84cc16' },
  { id: 'messaging',           label: 'Mensajería',             description: 'Envía mensajes y gestiona canales en Slack',                               color: '#6366f1' },
  { id: 'knowledge_base',      label: 'Base de Conocimiento',   description: 'Consulta y responde desde una base de conocimiento RAG propia',            color: '#0ea5e9' },
  { id: 'translation',         label: 'Traducción',             description: 'Traduce textos y documentos entre idiomas',                                color: '#d946ef' },
  { id: 'scheduling',          label: 'Planificación de Tareas', description: 'Organiza, prioriza y hace seguimiento de tareas y proyectos',             color: '#64748b' },
];

export const SKILL_MAP = new Map(AGENT_SKILLS.map((s) => [s.id, s]));

export function getSkillLabel(id: string): string {
  return SKILL_MAP.get(id)?.label ?? id;
}

export function getSkillColor(id: string): string {
  return SKILL_MAP.get(id)?.color ?? '#94a3b8';
}
