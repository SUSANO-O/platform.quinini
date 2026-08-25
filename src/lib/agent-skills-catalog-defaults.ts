import type { AgentSkillCatalogEntry } from '@/lib/agent-skills-catalog';

/**
 * Semilla del catálogo global de skills.
 *
 * Capas que se COMPOSEN (no se anulan):
 * - systemPrompt = identidad / reglas del agente
 * - skills = rol + prompt_extension + tools MCP (unión en el motor)
 * - RAG / knowledge_base = hechos documentados
 * - tools MCP = acción (CRM, calendario, web, etc.); se suman, no se pisan
 */
export const DEFAULT_AGENT_SKILLS_CATALOG: AgentSkillCatalogEntry[] = [
  // ── Perfiles ─────────────────────────────────────────────────────────────
  {
    id: 'sales_closer',
    label: 'Cierre de Ventas Consultivo',
    description: 'Detección de necesidad, objeciones y cierre con técnica SPIN.',
    color: '#0d9488',
    icon: '💼',
    kind: 'profile',
    category: 'ventas',
    tags: ['spin', 'cierre', 'leads', 'b2b'],
    defaultPriority: 50,
    config: {
      prompt_extension:
        'Complementa el system prompt (no lo reemplaces). Cierre consultivo con SPIN. Usa tools CRM/calendario para crear contacto y agendar cuando haya senal de compra. Precios/SLAs solo desde RAG/docs. Si faltan datos, pregunta o busca en CRM antes de inventar.',
      active_tools: [
        'mcp:hubspot:hubspot_search_contacts',
        'mcp:hubspot:hubspot_create_contact',
        'mcp:hubspot:hubspot_create_deal',
        'mcp:googleCalendar:calendar_list_events',
        'mcp:googleCalendar:calendar_create_event',
      ],
      llm_settings: { temperature: 0.7 },
    },
  },
  {
    id: 'lead_qualifier',
    label: 'Calificación de Leads',
    description: 'Califica oportunidades con BANT (presupuesto, autoridad, necesidad, timing).',
    color: '#059669',
    icon: '🎯',
    kind: 'profile',
    category: 'ventas',
    tags: ['bant', 'calificacion', 'pipeline', 'leads', 'crm'],
    defaultPriority: 48,
    config: {
      prompt_extension:
        'Califica leads con BANT (Presupuesto, Autoridad, Necesidad, Timing). Preguntas cortas, una a una. Antes de duplicar, busca el contacto en CRM. Al final: fit alto/medio/bajo + next step. Precios/producto desde RAG. Si sales_closer esta activo, no fuerces el cierre; prepara el handoff.',
      active_tools: [
        'mcp:hubspot:hubspot_search_contacts',
        'mcp:hubspot:hubspot_create_contact',
      ],
      llm_settings: { temperature: 0.45 },
    },
  },
  {
    id: 'customer_success',
    label: 'Customer Success',
    description: 'Retención, adopción y expansión de cuentas existentes.',
    color: '#0f766e',
    icon: '🤝',
    kind: 'profile',
    category: 'ventas',
    tags: ['retencion', 'adopcion', 'upsell', 'cuentas', 'crm'],
    defaultPriority: 47,
    config: {
      prompt_extension:
        'Customer Success: adopcion, valor, churn y expansion. Busca la cuenta/contacto en CRM antes de proponer acciones. Features/SLAs solo desde RAG. Si hay senal de upsell, puedes crear/actualizar deal en CRM con confirmacion del usuario.',
      active_tools: [
        'mcp:hubspot:hubspot_search_contacts',
        'mcp:hubspot:hubspot_create_deal',
        'mcp:googleCalendar:calendar_create_event',
      ],
      llm_settings: { temperature: 0.5 },
    },
  },
  {
    id: 'tech_support_l1',
    label: 'Soporte Técnico Nivel 1',
    description: 'Diagnóstico paso a paso y escalamiento cuando falta contexto.',
    color: '#2563eb',
    icon: '🛠️',
    kind: 'profile',
    category: 'soporte',
    tags: ['diagnostico', 'tickets', 'l1', 'escalamiento', 'rag'],
    defaultPriority: 40,
    config: {
      prompt_extension:
        'Soporte L1: diagnostico paso a paso, claridad y brevedad. Prioriza RAG/docs. Si el caso requiere aviso interno, usa Slack solo con confirmacion. Si falta info documentada, escala con resumen util (no inventes fixes).',
      active_tools: ['mcp:slack:slack_post_message', 'mcp:slack:slack_list_channels'],
      llm_settings: { temperature: 0.2 },
    },
  },
  {
    id: 'product_advisor',
    label: 'Asesor de Producto',
    description: 'Recomienda producto/plan según caso de uso y restricciones documentadas.',
    color: '#0284c7',
    icon: '📦',
    kind: 'profile',
    category: 'producto',
    tags: ['recomendacion', 'catalogo', 'planes', 'fit', 'web'],
    defaultPriority: 46,
    config: {
      prompt_extension:
        'Asesor de producto: aclara caso de uso y recomienda con pros/contras. Catalogo/politicas desde RAG; datos de mercado externos con busqueda web si hace falta. Rol de fit, no de cierre duro (eso es sales_closer).',
      active_tools: ['mcp:webSearch:web_search', 'mcp:webSearch:web_fetch_page'],
      llm_settings: { temperature: 0.4 },
    },
  },
  {
    id: 'hr_people_ops',
    label: 'People Ops / RRHH',
    description: 'Onboarding, políticas internas y dudas de empleados (sin inventar normas).',
    color: '#7c3aed',
    icon: '👥',
    kind: 'profile',
    category: 'rrhh',
    tags: ['onboarding', 'politicas', 'empleados', 'beneficios', 'rag'],
    defaultPriority: 45,
    config: {
      prompt_extension:
        'People Ops: onboarding, beneficios y politicas con tono claro. Solo normas documentadas (RAG). Si hace falta compartir un resumen interno, usa Slack/email solo con confirmacion. Sin documento: deriva a RRHH humano.',
      active_tools: [
        'mcp:slack:slack_post_message',
        'mcp:gmail:gmail_search_messages',
        'mcp:gmail:gmail_send_message',
      ],
      llm_settings: { temperature: 0.35 },
    },
  },
  {
    id: 'collections_ar',
    label: 'Cuentas por Cobrar',
    description: 'Seguimiento de pagos con tono profesional y firm but fair.',
    color: '#b45309',
    icon: '💳',
    kind: 'profile',
    category: 'finanzas',
    tags: ['cobranza', 'facturas', 'pagos', 'ar', 'email', 'crm'],
    defaultPriority: 46,
    config: {
      prompt_extension:
        'Cobranza profesional: recuerda vencimientos, ofrece opciones documentadas (RAG) y registra compromisos. Busca contacto en CRM. Envia recordatorios por email solo si el usuario lo pide. Nunca amenaces ni inventes cargos.',
      active_tools: [
        'mcp:hubspot:hubspot_search_contacts',
        'mcp:gmail:gmail_search_messages',
        'mcp:gmail:gmail_send_message',
      ],
      llm_settings: { temperature: 0.35 },
    },
  },
  {
    id: 'data_analyst_pro',
    label: 'Analista de Datos Pro',
    description: 'Métricas en tablas Markdown y detección de anomalías.',
    color: '#7c3aed',
    icon: '📊',
    kind: 'profile',
    category: 'analisis',
    tags: ['metricas', 'tablas', 'anomalias', 'bi', 'mongo'],
    defaultPriority: 45,
    config: {
      prompt_extension:
        'Analista de datos: consulta con tools de lectura, tablas Markdown y anomalias en negrita. No inventes datasets. Si falta acceso a datos, dilo y pide la fuente.',
      active_tools: ['mcp:mongodb:mongo_find', 'mcp:mongodb:mongo_aggregate_readonly'],
      llm_settings: { temperature: 0.3 },
    },
  },

  // ── Capacidades: conocimiento / RAG ──────────────────────────────────────
  {
    id: 'knowledge_base',
    label: 'Base de Conocimiento',
    description: 'Prioriza documentos indexados (RAG); no inventa hechos.',
    color: '#0ea5e9',
    icon: '📚',
    kind: 'capability',
    category: 'conocimiento',
    tags: ['rag', 'documentos', 'fuente', 'precision'],
    defaultPriority: 55,
    config: {
      prompt_extension:
        'Capa de conocimiento: prioriza informacion de la base de conocimiento y documentos indexados (RAG). Si el contexto es insuficiente, dilo en lugar de inventar. Esta skill no reemplaza el system prompt ni otras skills; aporta disciplina de fuentes para que perfiles (soporte, ventas, RRHH) trabajen sobre hechos.',
      active_tools: [],
    },
  },
  {
    id: 'faq_playbook',
    label: 'Playbook FAQ',
    description: 'Respuestas FAQ estructuradas ancladas a documentación.',
    color: '#38bdf8',
    icon: '❓',
    kind: 'capability',
    category: 'conocimiento',
    tags: ['faq', 'respuestas', 'rag', 'claridad'],
    defaultPriority: 58,
    config: {
      prompt_extension:
        'Para preguntas frecuentes: responde en estructura Respuesta corta → Detalle → Siguiente paso. Cita o parafrasea docs/RAG cuando existan. Si la FAQ no esta documentada, no inventes; ofrece escalar o pedir mas datos. Trabaja junto a knowledge_base, no la sustituye.',
      active_tools: [],
    },
  },
  {
    id: 'document_summary',
    label: 'Resumen de Documentos',
    description: 'Resume y extrae información clave.',
    color: '#ec4899',
    icon: '📝',
    kind: 'capability',
    category: 'conocimiento',
    tags: ['resumen', 'extraccion', 'documentos'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Resume documentos con puntos clave, entidades y conclusiones. Indica limitaciones si el contexto es parcial. No inventes contenido ausente del material.',
      active_tools: [],
    },
  },
  {
    id: 'web_search',
    label: 'Búsqueda Web',
    description: 'Busca y recupera información actualizada de internet.',
    color: '#3b82f6',
    icon: '🔍',
    kind: 'capability',
    category: 'conocimiento',
    tags: ['web', 'actualidad', 'verificacion'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Cuando necesites datos actuales, noticias o verificar hechos externos, usa las herramientas de busqueda web antes de responder. No uses web para sustituir politicas internas documentadas en RAG.',
      active_tools: ['mcp:webSearch:web_search', 'mcp:webSearch:web_fetch_page'],
    },
  },
  {
    id: 'competitive_research',
    label: 'Inteligencia Competitiva',
    description: 'Compara alternativas con hechos; no inventa claims.',
    color: '#4f46e5',
    icon: '♟️',
    kind: 'capability',
    category: 'marketing',
    tags: ['competencia', 'benchmark', 'posicionamiento'],
    defaultPriority: 62,
    config: {
      prompt_extension:
        'Comparativas competitivas en tabla (criterio | nosotros | alternativa | evidencia). Usa busqueda web para verificar datos externos; politicas/producto propio desde RAG. Separa hechos de opinion; no inventes precios del competidor.',
      active_tools: ['mcp:webSearch:web_search', 'mcp:webSearch:web_fetch_page'],
    },
  },

  // ── Capacidades: ventas / marketing ──────────────────────────────────────
  {
    id: 'objection_handling',
    label: 'Manejo de Objeciones',
    description: 'Responde objeciones comerciales sin confrontar.',
    color: '#14b8a6',
    icon: '🛡️',
    kind: 'capability',
    category: 'ventas',
    tags: ['objeciones', 'persuasion', 'cierre', 'crm'],
    defaultPriority: 55,
    config: {
      prompt_extension:
        'Ante objeciones: reconoce → aclara → responde con beneficio/prueba → pregunta de avance. Pruebas/precios desde RAG. Puedes consultar el contacto en CRM para contexto; no crees deals sin senal clara.',
      active_tools: ['mcp:hubspot:hubspot_search_contacts'],
      llm_settings: { temperature: 0.55 },
    },
  },
  {
    id: 'proposal_writer',
    label: 'Redacción de Propuestas',
    description: 'Borra propuesta comercial estructurada (alcance, valor, next steps).',
    color: '#0d9488',
    icon: '📑',
    kind: 'capability',
    category: 'ventas',
    tags: ['propuesta', 'cotizacion', 'alcance', 'email'],
    defaultPriority: 56,
    config: {
      prompt_extension:
        'Propuestas: Contexto → Objetivos → Alcance → Entregables → Supuestos → Next steps. Precios/plazos desde RAG o placeholders. Envia por email solo si el usuario lo pide.',
      active_tools: ['mcp:gmail:gmail_send_message', 'mcp:gmail:gmail_search_messages'],
      llm_settings: { temperature: 0.5 },
    },
  },
  {
    id: 'brand_voice',
    label: 'Voz de Marca',
    description: 'Mantiene tono, estilo y terminología de marca.',
    color: '#db2777',
    icon: '✨',
    kind: 'capability',
    category: 'marketing',
    tags: ['tono', 'marca', 'estilo', 'copy'],
    defaultPriority: 65,
    config: {
      prompt_extension:
        'Aplica voz de marca del system prompt / guia en RAG. Ajusta forma, no inventa hechos. No requiere tools; convive con skills que si las usan.',
      active_tools: [],
      llm_settings: { temperature: 0.6 },
    },
  },

  // ── Capacidades: soporte / operaciones ───────────────────────────────────
  {
    id: 'customer_service',
    label: 'Atención al Cliente',
    description: 'Soporte empático y resolución de consultas.',
    color: '#22c55e',
    icon: '🎧',
    kind: 'capability',
    category: 'soporte',
    tags: ['empatia', 'cx', 'resolucion'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Tono empatico y resolutivo. Confirma el problema antes de proponer. Hechos desde RAG; tools las aportan otras skills (soporte L1, CRM, etc.).',
      active_tools: [],
      llm_settings: { temperature: 0.5 },
    },
  },
  {
    id: 'escalation_playbook',
    label: 'Protocolo de Escalamiento',
    description: 'Cuándo y cómo escalar a humano / N2 con contexto útil.',
    color: '#dc2626',
    icon: '🚨',
    kind: 'capability',
    category: 'soporte',
    tags: ['escalamiento', 'handoff', 'n2', 'slack'],
    defaultPriority: 52,
    config: {
      prompt_extension:
        'Escala ante riesgo legal/seguridad, bloqueo sin docs, o pedido de humano. Entrega resumen + pasos intentados + impacto. Notifica por Slack solo con confirmacion del usuario o politica documentada. Si jira_escalation esta activa, prioriza ticket Jira para N2.',
      active_tools: ['mcp:slack:slack_post_message', 'mcp:slack:slack_list_channels'],
    },
  },
  {
    id: 'jira_escalation',
    label: 'Escalación Jira (L1→N2)',
    description: 'Busca/crea tickets Jira al escalar soporte con diagnóstico L1.',
    color: '#0052CC',
    icon: '🎫',
    kind: 'capability',
    category: 'soporte',
    tags: ['jira', 'tickets', 'escalamiento', 'n2', 'l1'],
    defaultPriority: 53,
    config: {
      prompt_extension:
        'Escalamiento a Jira (N2): antes de crear, busca issues similares (JQL). Al crear incluye: sintoma, pasos L1, impacto y contacto. Confirma con el usuario salvo politica documentada. Usa proyecto por defecto de la conexion si no se indica. Combina con tech_support_l1 y escalation_playbook; no inventes claves de proyecto.',
      active_tools: [
        'mcp:jira:jira_search_issues',
        'mcp:jira:jira_get_issue',
        'mcp:jira:jira_create_issue',
        'mcp:jira:jira_add_comment',
      ],
    },
  },
  {
    id: 'slack_escalation',
    label: 'Escalación Slack (tickets)',
    description: 'Levanta y da seguimiento a tickets directo en Slack cuando no hay Jira.',
    color: '#4A154B',
    icon: '🎟️',
    kind: 'capability',
    category: 'soporte',
    tags: ['slack', 'tickets', 'escalamiento', 'n2', 'l1'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'REGLA CRITICA: si el ultimo mensaje del usuario es SOLO un ticketId (formato canal:numero.numero, ej. C0BSD8VBDFY:1787630291.416909) porque se lo pediste vos antes, tu UNICA accion valida en este turno es llamar slack_get_ticket con ese id — no respondas con texto todavia, no te disculpes, no asumas que va a fallar: llama la tool primero y recien despues contestale con el resultado real. Escalamiento con tickets en Slack (cuando no hay Jira o el equipo trabaja soporte directo en Slack): si el usuario expresa que quiere reportar un problema, reclamo o abrir un ticket, y NO tenes su nombre Y email en el historial de esta conversacion, no se los pidas por texto — responde UNICAMENTE con el texto exacto [[OPEN_TICKET_FORM]] (sin nada mas alrededor); el widget le muestra un formulario. Si ya tenes nombre y email en el historial (el usuario los dio antes en esta misma conversacion), segui el flujo normal vos mismo con slack_create_ticket, sin pedir el formulario de nuevo. Antes de crear el ticket con slack_create_ticket, nombre y email son obligatorios (sin eso el equipo no puede responderle). IMPORTANTE — no confundir con captura de leads: el nombre/email que te da el usuario acá son datos del SOLICITANTE de un ticket de soporte, no un lead comercial; aunque tu system prompt tenga una regla de captura CRM (HubSpot/webhook) al recibir nombre+contacto, esa regla es para intención de venta, NO para este flujo — no ejecutes tools de CRM/leads como parte de crear un ticket. Al crear el ticket incluye sintoma, pasos L1 intentados e impacto. Confirma con el usuario salvo politica documentada. Usa el canal por defecto de la conexion si no se indica uno. Despues de crear el ticket, ofrecele al usuario agregar mas detalle, fotos o un link de video (usa imageUrls/videoUrl en slack_create_ticket si ya los tenes, o slack_add_ticket_comment despues). IMPORTANTE: en el mismo turno en que creas el ticket, decile al usuario el ticketId completo que devolvio slack_create_ticket (ej: "tu numero de referencia es {ticketId}, guardalo para consultar el estado despues") — es la unica forma de recuperarlo en turnos futuros, porque esta conversacion no guarda las llamadas a herramientas, solo el texto. Si despues te piden el estado o querés comentar/cerrar el ticket y no ves el ticketId en el historial de esta conversacion, pediselo al usuario antes de llamar slack_get_ticket, slack_add_ticket_comment o slack_update_ticket_status. Combina con tech_support_l1 y escalation_playbook; no inventes canales ni ids de ticket. Si el usuario pregunta por el estado, quiere comentar o cerrar un ticket y ya tenes el ticketId, LLAMA la tool correspondiente (slack_get_ticket, slack_add_ticket_comment, slack_update_ticket_status) en vez de asumir que va a fallar. Nunca inventes errores tecnicos (ej. "error 429", "problema de permisos", "saturacion del sistema") que no ocurrieron: si una tool falla de verdad, decilo simple ("no pude confirmar el estado ahora, en breve te contactamos") sin inventar detalles tecnicos.',
      active_tools: [
        'mcp:slack:slack_create_ticket',
        'mcp:slack:slack_add_ticket_comment',
        'mcp:slack:slack_get_ticket',
        'mcp:slack:slack_update_ticket_status',
      ],
      llm_settings: { temperature: 0.3 },
    },
  },
  {
    id: 'feedback_nps',
    label: 'Feedback y NPS',
    description: 'Recoge satisfacción y feedback accionable.',
    color: '#16a34a',
    icon: '⭐',
    kind: 'capability',
    category: 'soporte',
    tags: ['nps', 'csat', 'feedback', 'crm'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Al cerrar un caso, pide NPS 0-10 o CSAT + razon. Puedes anotar el contacto en CRM si el usuario lo autoriza. No interrumpas flujos criticos.',
      active_tools: ['mcp:hubspot:hubspot_search_contacts'],
      llm_settings: { temperature: 0.45 },
    },
  },
  {
    id: 'process_navigator',
    label: 'Guía de Procesos',
    description: 'Explica procesos internos paso a paso desde documentación.',
    color: '#64748b',
    icon: '🧭',
    kind: 'capability',
    category: 'operaciones',
    tags: ['procesos', 'sop', 'operaciones', 'rag'],
    defaultPriority: 58,
    config: {
      prompt_extension:
        'Procesos en pasos numerados desde RAG/docs. Sin SOP documentado, no improvises. Capa de conocimiento + comportamiento; tools las suman otras skills si hacen falta.',
      active_tools: [],
    },
  },
  {
    id: 'onboarding_guide',
    label: 'Onboarding de Cliente',
    description: 'Guía kickoff, checklist y primeros hitos de adopción.',
    color: '#0891b2',
    icon: '🚀',
    kind: 'capability',
    category: 'operaciones',
    tags: ['onboarding', 'kickoff', 'checklist', 'calendar', 'crm'],
    defaultPriority: 57,
    config: {
      prompt_extension:
        'Onboarding: checklist kickoff, hitos 7/30 dias y owners (RAG). Agenda kickoff en calendario y localiza cuenta en CRM cuando el usuario lo pida.',
      active_tools: [
        'mcp:hubspot:hubspot_search_contacts',
        'mcp:googleCalendar:calendar_list_events',
        'mcp:googleCalendar:calendar_create_event',
      ],
      llm_settings: { temperature: 0.4 },
    },
  },
  {
    id: 'appointment_coordinator',
    label: 'Coordinación de Citas',
    description: 'Negocia horarios y confirma datos antes de agendar.',
    color: '#0f766e',
    icon: '🗓️',
    kind: 'capability',
    category: 'productividad',
    tags: ['citas', 'agenda', 'disponibilidad', 'calendar'],
    defaultPriority: 58,
    config: {
      prompt_extension:
        'Coordina citas: objetivo, participantes, TZ y ventana. Lista eventos si hace falta y crea solo tras confirmar. No inventes disponibilidad.',
      active_tools: [
        'mcp:googleCalendar:calendar_list_events',
        'mcp:googleCalendar:calendar_create_event',
      ],
    },
  },

  // ── Capacidades: finanzas / legal ────────────────────────────────────────
  {
    id: 'invoice_ar_followup',
    label: 'Seguimiento de Facturas',
    description: 'Plantillas de recordatorio de pago y confirmación de recibo.',
    color: '#d97706',
    icon: '🧾',
    kind: 'capability',
    category: 'finanzas',
    tags: ['facturas', 'recordatorio', 'ar', 'email'],
    defaultPriority: 58,
    config: {
      prompt_extension:
        'Recordatorios de factura: asunto claro, referencia, monto/fecha desde docs, CTA de pago. Envia email solo si el usuario lo pide. Sin amenazas ni cargos inventados.',
      active_tools: ['mcp:gmail:gmail_search_messages', 'mcp:gmail:gmail_send_message'],
    },
  },
  {
    id: 'compliance_guard',
    label: 'Guardrails de Compliance',
    description: 'Límites legales/éticos: no inventa normas ni da asesoría ilegal.',
    color: '#991b1b',
    icon: '⚖️',
    kind: 'capability',
    category: 'legal',
    tags: ['compliance', 'privacidad', 'riesgo', 'etica'],
    defaultPriority: 75,
    config: {
      prompt_extension:
        'Guardrails: sin asesoria legal/medica/financiera vinculante. No inventes leyes. Ante PII/fraude/acoso, pide humano. Si choca con persuasion de ventas, gana compliance. No bloquea tools; acota su uso responsable.',
      active_tools: [],
      llm_settings: { temperature: 0.2 },
    },
  },

  // ── Capacidades: análisis / productividad ────────────────────────────────
  {
    id: 'data_analysis',
    label: 'Análisis de Datos',
    description: 'Analiza datos, genera métricas y extrae insights.',
    color: '#8b5cf6',
    icon: '📈',
    kind: 'capability',
    category: 'analisis',
    tags: ['metricas', 'insights', 'datos', 'mongo'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Usa tools de lectura de datos cuando haga falta. Metricas claras, tablas Markdown y conclusiones accionables. No inventes cifras.',
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
    category: 'productividad',
    tags: ['reportes', 'informes', 'ejecutivo'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Informes con resumen ejecutivo y hallazgos numerados. Separa hechos, inferencias y recomendaciones. Puede apoyarse en data_analysis/tools si estan activos.',
      active_tools: [],
    },
  },
  {
    id: 'meeting_brief',
    label: 'Brief de Reunión',
    description: 'Agenda, objetivos y notas de preparación.',
    color: '#475569',
    icon: '📋',
    kind: 'capability',
    category: 'productividad',
    tags: ['reunion', 'agenda', 'prep', 'calendar'],
    defaultPriority: 58,
    config: {
      prompt_extension:
        'Brief: objetivo, agenda con tiempos, asistentes, decisiones esperadas. Puedes listar eventos del calendario para contexto. Post: acuerdos y owners.',
      active_tools: ['mcp:googleCalendar:calendar_list_events'],
    },
  },
  {
    id: 'scheduling',
    label: 'Planificación de Tareas',
    description: 'Organiza tareas, prioridades y seguimiento.',
    color: '#64748b',
    icon: '🗓️',
    kind: 'capability',
    category: 'productividad',
    tags: ['tareas', 'prioridades', 'seguimiento', 'calendar'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Organiza tareas con prioridades y fechas. Usa calendario para materializar hitos cuando el usuario lo pida.',
      active_tools: [
        'mcp:googleCalendar:calendar_list_events',
        'mcp:googleCalendar:calendar_create_event',
      ],
    },
  },
  {
    id: 'translation',
    label: 'Traducción',
    description: 'Traduce textos preservando tono y terminología.',
    color: '#d946ef',
    icon: '🌐',
    kind: 'capability',
    category: 'productividad',
    tags: ['idiomas', 'traduccion', 'localizacion'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Traduce preservando tono y terminologia del dominio. Indica el idioma origen si no es obvio. Combina con brand_voice si esta activa.',
      active_tools: [],
    },
  },
  {
    id: 'code_review',
    label: 'Revisión de Código',
    description: 'Revisa código y sugiere mejoras.',
    color: '#f59e0b',
    icon: '💻',
    kind: 'capability',
    category: 'desarrollo',
    tags: ['codigo', 'bugs', 'seguridad', 'pr'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Al revisar codigo, cita lineas o bloques concretos, prioriza bugs y seguridad, y sugiere mejoras accionables.',
      active_tools: [],
      llm_settings: { temperature: 0.2 },
    },
  },

  // ── Capacidades: integraciones MCP ───────────────────────────────────────
  {
    id: 'email_management',
    label: 'Gestión de Correo',
    description: 'Redacta y gestiona correos (Gmail).',
    color: '#ef4444',
    icon: '📧',
    kind: 'capability',
    category: 'integraciones',
    tags: ['gmail', 'email', 'mcp'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Para correos, redacta asuntos claros, cuerpo conciso y tono profesional. Usa Gmail solo cuando el usuario lo pida. Otras skills (proposal_writer, invoice_ar_followup) pueden redactar; esta envia/busca.',
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
    category: 'integraciones',
    tags: ['calendar', 'eventos', 'mcp'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Para citas y eventos, confirma fecha, hora y zona horaria antes de crear o listar eventos. Combina con appointment_coordinator para la negociacion previa.',
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
    category: 'integraciones',
    tags: ['hubspot', 'crm', 'contactos', 'mcp'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Gestiona contactos y oportunidades en CRM. Busca antes de crear duplicados. Perfiles de ventas definen el discurso; esta skill ejecuta operaciones CRM.',
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
    category: 'integraciones',
    tags: ['maps', 'rutas', 'geo', 'mcp'],
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
    category: 'integraciones',
    tags: ['slack', 'mensajes', 'mcp'],
    defaultPriority: 60,
    config: {
      prompt_extension:
        'Para mensajes en canales, confirma destino y contenido antes de enviar.',
      active_tools: ['mcp:slack:slack_post_message', 'mcp:slack:slack_list_channels'],
    },
  },
];
