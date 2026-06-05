import type { AgentSkillCatalogEntry } from '@/lib/agent-skills-catalog';

/** Semilla inicial si la colección Mongo está vacía. */
export const DEFAULT_AGENT_SKILLS_CATALOG: AgentSkillCatalogEntry[] = [
  {
    id: 'sales_closer',
    label: 'Cierre de Ventas Consultivo',
    description: 'Detección de necesidad, objeciones y cierre con técnica SPIN.',
    color: '#0d9488',
    icon: '💼',
    kind: 'profile',
    defaultPriority: 50,
    config: {
      prompt_extension:
        'Tu objetivo principal es identificar la necesidad del cliente y llevarlo hacia el cierre. Utiliza la tecnica SPIN Selling. Al detectar una senal de compra, solicita el correo o numero para agendar una cita. No des respuestas largas; se persuasivo y directo.',
      active_tools: ['mcp:hubspot:hubspot_create_contact', 'mcp:googleCalendar:calendar_create_event'],
      llm_settings: { temperature: 0.7 },
    },
  },
  {
    id: 'tech_support_l1',
    label: 'Soporte Técnico Nivel 1',
    description: 'Diagnóstico paso a paso y escalamiento cuando falta contexto.',
    color: '#2563eb',
    icon: '🛠️',
    kind: 'profile',
    defaultPriority: 40,
    config: {
      prompt_extension:
        'Actua como un experto en soporte. Sigue un protocolo de diagnostico paso a paso. No supongas soluciones; si no tienes la informacion en tu base de conocimientos (RAG) o documentos indexados, indica que escalas el caso. Prioriza la claridad tecnica y la brevedad.',
      active_tools: [],
      llm_settings: { temperature: 0.2 },
    },
  },
  {
    id: 'data_analyst_pro',
    label: 'Analista de Datos Pro',
    description: 'Métricas en tablas Markdown y detección de anomalías.',
    color: '#7c3aed',
    icon: '📊',
    kind: 'profile',
    defaultPriority: 45,
    config: {
      prompt_extension:
        'Eres un analista de datos. Antes de responder, desglosa el problema logicamente. Siempre que entregues cifras, hazlo en formato de tabla Markdown. Si detectas anomalias en los datos, resaltalas en negrita.',
      active_tools: ['mcp:mongodb:mongo_find', 'mcp:mongodb:mongo_aggregate_readonly'],
      llm_settings: { temperature: 0.3 },
    },
  },
  {
    id: 'web_search',
    label: 'Búsqueda Web',
    description: 'Busca y recupera información actualizada de internet.',
    color: '#3b82f6',
    icon: '🔍',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Cuando necesites datos actuales, noticias o verificar hechos, usa las herramientas de busqueda web antes de responder.',
      active_tools: ['mcp:webSearch:web_search', 'mcp:webSearch:web_fetch_page'],
    },
  },
  {
    id: 'knowledge_base',
    label: 'Base de Conocimiento',
    description: 'Consulta y responde desde documentos indexados (RAG).',
    color: '#0ea5e9',
    icon: '📚',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Prioriza la informacion de tu base de conocimiento y documentos indexados (RAG). Si no hay contexto suficiente, dilo claramente en lugar de inventar.',
      active_tools: [],
    },
  },
  {
    id: 'data_analysis',
    label: 'Análisis de Datos',
    description: 'Analiza datos, genera métricas y extrae insights.',
    color: '#8b5cf6',
    icon: '📈',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Estructura tus respuestas con metricas claras, tablas Markdown cuando aplique y conclusiones accionables.',
      active_tools: ['mcp:mongodb:mongo_find', 'mcp:mongodb:mongo_aggregate_readonly'],
      llm_settings: { temperature: 0.3 },
    },
  },
  {
    id: 'report_generation',
    label: 'Generación de Reportes',
    description: 'Crea reportes e informes estructurados.',
    color: '#06b6d4',
    icon: '📄',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Genera informes estructurados con secciones, resumen ejecutivo y hallazgos numerados.',
      active_tools: [],
    },
  },
  {
    id: 'customer_service',
    label: 'Atención al Cliente',
    description: 'Soporte empático y resolución de consultas.',
    color: '#22c55e',
    icon: '🎧',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Mantén tono empatico y orientado a resolver. Confirma el problema antes de proponer soluciones.',
      active_tools: [],
      llm_settings: { temperature: 0.5 },
    },
  },
  {
    id: 'code_review',
    label: 'Revisión de Código',
    description: 'Revisa código y sugiere mejoras.',
    color: '#f59e0b',
    icon: '💻',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Al revisar codigo, cita lineas o bloques concretos, prioriza bugs y seguridad, y sugiere mejoras accionables.',
      active_tools: [],
      llm_settings: { temperature: 0.2 },
    },
  },
  {
    id: 'document_summary',
    label: 'Resumen de Documentos',
    description: 'Resume y extrae información clave.',
    color: '#ec4899',
    icon: '📝',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Resume documentos con puntos clave, entidades y conclusiones. Indica limitaciones si el contexto es parcial.',
      active_tools: [],
    },
  },
  {
    id: 'email_management',
    label: 'Gestión de Correo',
    description: 'Redacta y gestiona correos (Gmail).',
    color: '#ef4444',
    icon: '📧',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Para correos, redacta asuntos claros, cuerpo conciso y tono profesional. Usa Gmail solo cuando el usuario lo pida.',
      active_tools: ['mcp:gmail:gmail_search_messages', 'mcp:gmail:gmail_send_message'],
    },
  },
  {
    id: 'calendar_management',
    label: 'Gestión de Calendario',
    description: 'Crea y gestiona eventos en Google Calendar.',
    color: '#14b8a6',
    icon: '📅',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Para citas y eventos, confirma fecha, hora y zona horaria antes de crear o listar eventos.',
      active_tools: ['mcp:googleCalendar:calendar_list_events', 'mcp:googleCalendar:calendar_create_event'],
    },
  },
  {
    id: 'crm_integration',
    label: 'Integración CRM',
    description: 'Opera con contactos y negocios en HubSpot.',
    color: '#f97316',
    icon: '🏢',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Gestiona contactos y oportunidades en CRM. Busca antes de crear duplicados.',
      active_tools: [
        'mcp:hubspot:hubspot_search_contacts',
        'mcp:hubspot:hubspot_create_contact',
        'mcp:hubspot:hubspot_create_deal',
      ],
    },
  },
  {
    id: 'maps_geolocation',
    label: 'Mapas y Geolocalización',
    description: 'Geocodifica, busca lugares y calcula rutas.',
    color: '#84cc16',
    icon: '🗺️',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Para ubicaciones y rutas, usa geocodificacion y direcciones verificadas; no inventes coordenadas.',
      active_tools: [
        'mcp:googleMaps:maps_geocode',
        'mcp:googleMaps:maps_search_places',
        'mcp:googleMaps:maps_get_directions',
      ],
    },
  },
  {
    id: 'messaging',
    label: 'Mensajería',
    description: 'Envía mensajes y gestiona canales en Slack.',
    color: '#6366f1',
    icon: '💬',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Para mensajes en canales, confirma destino y contenido antes de enviar.',
      active_tools: ['mcp:slack:slack_post_message', 'mcp:slack:slack_list_channels'],
    },
  },
  {
    id: 'translation',
    label: 'Traducción',
    description: 'Traduce textos preservando tono y terminología.',
    color: '#d946ef',
    icon: '🌐',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Traduce preservando tono y terminologia del dominio. Indica el idioma origen si no es obvio.',
      active_tools: [],
    },
  },
  {
    id: 'scheduling',
    label: 'Planificación de Tareas',
    description: 'Organiza tareas, prioridades y seguimiento.',
    color: '#64748b',
    icon: '🗓️',
    kind: 'capability',
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Organiza tareas con prioridades, fechas y siguientes pasos concretos.',
      active_tools: ['mcp:googleCalendar:calendar_list_events', 'mcp:googleCalendar:calendar_create_event'],
    },
  },
];
