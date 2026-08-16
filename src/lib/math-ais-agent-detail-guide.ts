/**
 * Guía RAG — ficha de agente (/dashboard/agents/[id]).
 * Math-ais usa esto para orientar sin captura cuando la URL es detalle de agente.
 */

export const AGENT_DETAIL_TABS = [
  {
    id: 'general',
    label: 'General',
    section: 1,
    path: '/dashboard/agents/{agentId}',
    description:
      'Información básica: nombre, descripción, token público del widget (opcional), modo solo propósito, memoria persistente de conversación. Botones Desactivar/Eliminar arriba. Badge Hub sync y modelo.',
  },
  {
    id: 'rules',
    label: 'Reglas',
    section: 2,
    path: '/dashboard/agents/{agentId}',
    description:
      'Reglas de comportamiento y flujo: prioridad, tono, reclamos, respuestas cortas, fallback. Se integran al system prompt al guardar. Botón + Agregar regla.',
  },
  {
    id: 'faqs',
    label: 'FAQ',
    section: 3,
    path: '/dashboard/agents/{agentId}',
    description:
      'Preguntas frecuentes Q/A en cada conversación. Candidatas desde el widget (preguntas repetidas sin FAQ). Botones Crear FAQ / Eliminar candidata.',
  },
  {
    id: 'tools',
    label: 'Herramientas',
    section: 4,
    path: '/dashboard/agents/{agentId}',
    description:
      'Paso 1: conectar cuentas MCP (Gmail, HubSpot, Calendar, Slack, MongoDB, PostgreSQL, WhatsApp, Notion, Zapier). Paso 2: activar herramientas del plan sin cuenta extra (web search, Google Sheets, file-upload, webhook). No duplicar el mismo servicio en ambos pasos.',
  },
  {
    id: 'rag',
    label: 'Almacén',
    section: 5,
    path: '/dashboard/agents/{agentId}',
    description:
      'Almacenamiento / base de conocimiento (RAG): PDF, Word, imágenes OCR, TXT, CSV, JSON, URLs. Toggle activar almacenamiento. Métricas: fuentes RAG, vectores hub, memorias chat, contextos widget, retención.',
  },
  {
    id: 'subagents',
    label: 'Sub-agentes',
    section: 6,
    path: '/dashboard/agents/{agentId}',
    description:
      'Orquestación: delegar subtareas a agentes especializados vinculados. Contador X/Y según plan. Botón + Agregar sub-agente.',
  },
  {
    id: 'scheduled-tasks',
    label: 'Tareas',
    section: 7,
    path: '/dashboard/agents/{agentId}',
    description:
      'Tareas programadas (cron): webhooks, agent_run, chat_message, email. Zona horaria America/Bogota. Disponible desde plan Plus (o override admin). Botón + Nueva tarea.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    section: 8,
    path: '/dashboard/agents/{agentId}',
    description:
      'WhatsApp Business Cloud API: conectar número Meta, webhook callback botiva.space/api/whatsapp/webhook, verify token, alertas handoff. Requiere plan Plus+ para canal WhatsApp.',
  },
] as const;

export function mathAisAgentDetailGuideRagBlock(): { name: string; content: string } {
  const tabs = AGENT_DETAIL_TABS.map(
    (t) =>
      `## ${t.section}. ${t.label}\n${t.description}\nRuta: Dashboard → Agentes → [agente] → pestaña «${t.label}».`,
  ).join('\n\n');

  const body = `
# Ficha de agente — guía Math-ais

URL patrón: /dashboard/agents/{id} (24 caracteres hex Mongo).

Layout común: cabecera con «< Mis agentes», nombre del agente, badge Activo/Inactivo, modelo, Hub sync. Sidebar izquierda con 8 secciones numeradas. Tip contextual abajo del menú. Contenido principal a la derecha.

Cuando el contexto de sesión incluye SNAPSHOT DEL AGENTE EN PANTALLA, usa esos datos en vivo (reglas, FAQ, RAG, tools, sub-agentes, tareas, WhatsApp) para recomendar siguientes pasos. Si falta algo y el plan no lo incluye, sugiere upgrade con tacto (Team → sub-agentes básicos, Plus → RAG/WhatsApp/tareas, Business → multiagente avanzado e integraciones premium).

Checklist típico tras crear agente:
1) General — ajustar prompt y descripción
2) Reglas — tono y políticas
3) FAQ — convertir candidatas del widget
4) Herramientas — conectar MCP y activar tools
5) Almacén — subir conocimiento si aplica
6) Sub-agentes — si el caso es complejo (plan Team+)
7) Tareas — automatizar reportes (plan Plus+)
8) WhatsApp — canal adicional (plan Plus+)
9) Widget builder + preview + embed

${tabs}
`.trim();

  return {
    name: 'BotIvA — ficha de agente (8 secciones)',
    content: body,
  };
}
