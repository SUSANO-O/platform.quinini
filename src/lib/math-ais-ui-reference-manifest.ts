/**
 * Manifest de capturas de referencia del dashboard BotIvA para Math-ais.
 * Archivos: public/assets/platform-ui-ref/
 *
 * Tras cambios: npx tsx --env-file=.env scripts/patch-math-ais-onboarding.mts
 */

export type MathAisUiReferenceEntry = {
  id: string;
  file: string;
  title: string;
  screen: string;
  ragDescription: string;
};

const PUBLIC_PATH_PREFIX = '/assets/platform-ui-ref';

export const MATH_AIS_UI_REFERENCE_MANIFEST: MathAisUiReferenceEntry[] = [
  {
    id: 'dashboard-home',
    file: 'dashboard-home.png',
    title: 'Home dashboard',
    screen: '/dashboard',
    ragDescription:
      'Referencia UI BotIvA — Home del panel. Sidebar izquierda (BotIvA logo, Dashboard, Quick Start, Inbox, Chats, Agentes y widgets, Cuenta). Saludo "Hola, Mati", fecha, badge PANEL DE CONTROL, filtro Últimos 30 días, plan Business. Tarjetas: Conversaciones, Mensajes en rango, Agentes (19), Widgets (10). Uso del mes, Estado del sistema (verde "Todo funciona correctamente"), Suscripción y cuenta, Analítica de widgets. Burbuja Math-ais abajo a la derecha con POWERED BY BOTIVA.',
  },
  {
    id: 'login',
    file: 'login.png',
    title: 'Login BotIvA',
    screen: '/login',
    ragDescription:
      'Referencia UI BotIvA — Pantalla de inicio de sesión. Logo BotIvA (icono orb), título "BotIvA", subtítulo "Inicia sesión en tu cuenta". Campos Email y Contraseña, verificación Cloudflare "Operación exitosa", botón teal "Iniciar sesión", enlaces olvidé contraseña y crear cuenta. NO es el dashboard; es auth previo al panel.',
  },
  {
    id: 'quick-start',
    file: 'quick-start.png',
    title: 'Quick Start',
    screen: '/dashboard/quick-start',
    ragDescription:
      'Referencia UI BotIvA — Quick Start. Título con icono sparkle. Texto: sube hasta 3 PDFs para widget embebible en menos de 2 minutos. Zona drag-and-drop PDF (máx 10 MB, hasta 3 archivos). Botón "Crear widget en 1 clic".',
  },
  {
    id: 'inbox',
    file: 'inbox.png',
    title: 'Bandeja de entrada (Inbox)',
    screen: '/dashboard/inbox',
    ragDescription:
      'Referencia UI BotIvA — Bandeja de Entrada. Subtítulo conversaciones widgets y WhatsApp. Tabs Sin responder / Respondida, Abiertas (con contador) / Resueltas. Tarjetas de conversación con avatar, nombre visitante, badges Sin responder y En vivo, preview mensaje, botones Ver y responder, Resolver, Eliminar.',
  },
  {
    id: 'chats',
    file: 'chats.png',
    title: 'Chats (historial)',
    screen: '/dashboard/chats',
    ragDescription:
      'Referencia UI BotIvA — Chats. Historial de conversaciones de widgets. Tabs Activos / Todos / Cerrados, buscador, filtro por widget. Lista lateral con sesiones (Sesión xxx, ivan), timestamps, preview, tags Asesor Taller, Positivo, Escalado, Humano, contador msg. Panel derecho vacío hasta seleccionar chat.',
  },
  {
    id: 'agents',
    file: 'agents.png',
    title: 'Mis agentes',
    screen: '/dashboard/agents',
    ragDescription:
      'Referencia UI BotIvA — Mis agentes. Barra de cuota (19 agentes, plan Business ilimitados). Botón Nuevo agente. Grilla de tarjetas de agentes con nombre, descripción, modelo (Gemini), badge ACTIVO, Hub sincronizado, fecha actualización, botones Configurar y Pausar.',
  },
  {
    id: 'agents-new-basic',
    file: 'agents-new-basic.png',
    title: 'Crear agente — información básica',
    screen: '/dashboard/agents/new',
    ragDescription:
      'Referencia UI BotIvA — Crear agente (parte superior). Título "Crear agente", subtítulo sobre modelo e instrucciones. Sección INFORMACIÓN BÁSICA: campo Nombre del agente (requerido), Descripción opcional, iconos sparkle para sugerencias AI.',
  },
  {
    id: 'agents-new-ai-suggest',
    file: 'agents-new-ai-suggest.png',
    title: 'Crear agente — sugerir con AI',
    screen: '/dashboard/agents/new',
    ragDescription:
      'Referencia UI BotIvA — Crear agente, bloque "SUGERIR CON AI". Texto: llena el nombre para activar sugerencias de system prompt, FAQs y reglas. Botón "Generar sugerencias" (deshabilitado hasta tener nombre).',
  },
  {
    id: 'agents-new-models',
    file: 'agents-new-models.png',
    title: 'Crear agente — selector de modelos',
    screen: '/dashboard/agents/new',
    ragDescription:
      'Referencia UI BotIvA — Crear agente, catálogo de modelos. Filtros Todos/Multimodal/Chat/Visión/TTS/Imagen y Stable/Pro/Flash/Lite/Preview. Grilla de tarjetas (Gemini 2.5 Flash PRINCIPAL, Llama, Mistral, etc.) con ctx y tipo. Campos Temperatura y Max tokens salida. Sección modelo respaldo Hugging Face.',
  },
  {
    id: 'agents-new-prompt',
    file: 'agents-new-prompt.png',
    title: 'Crear agente — prompt y widget',
    screen: '/dashboard/agents/new',
    ragDescription:
      'Referencia UI BotIvA — Crear agente, TOKEN PÚBLICO DEL WIDGET (opcional) con botón Generar token. SYSTEM PROMPT requerido (textarea grande). Sección SOLO PROPÓSITO con checkbox "Activar modo solo propósito" marcado.',
  },
  {
    id: 'agents-new-mcp',
    file: 'agents-new-mcp.png',
    title: 'Crear agente — integraciones MCP',
    screen: '/dashboard/agents/new',
    ragDescription:
      'Referencia UI BotIvA — Crear agente, integraciones MCP opcionales. Tarjetas Gmail, HubSpot CRM, Google Calendar, Slack, Google Maps, MongoDB con badge Conectar, descripción, key y tools (mcp:gmail:*, etc.). Instrucciones para conectar tras crear el agente.',
  },
  {
    id: 'widgets',
    file: 'widgets.png',
    title: 'Mis widgets',
    screen: '/dashboard/widgets',
    ragDescription:
      'Referencia UI BotIvA — Mis widgets. Barra multiagente (widgets activos, derivaciones, paralelo, sesiones routing). Grilla de widgets con avatar, nombre, descripción agente, ACTIVO, posición, tema claro, Editar y Probar.',
  },
  {
    id: 'widgets-actions-menu',
    file: 'widgets-actions-menu.png',
    title: 'Mis widgets — menú de acciones',
    screen: '/dashboard/widgets',
    ragDescription:
      'Referencia UI BotIvA — Mis widgets con menú ⋮ abierto en una tarjeta. Opciones: Desactivar, Código embed, Compartir, Historial, Eliminar. Botón + Nuevo widget arriba. Buscador y Filtrar. Stats multiagente del mes. Tarjetas con badge ACTIVO, Editar y Probar.',
  },
  {
    id: 'widget-preview',
    file: 'widget-preview.png',
    title: 'Vista previa del widget',
    screen: '/dashboard/widget-preview',
    ragDescription:
      'Referencia UI BotIvA — Vista previa del widget. Enlace "Volver a Mis widgets". Título "Vista previa del widget", badges Orquestador/Activo/MCP/herramientas/RAG. Columnas: tarjetas Widget (nombre, ID, tema, posición, color, multi-agente), Chat y atajos, Agente, Equipo multi-agente. Preview del chat flotante a la derecha con burbuja, accesos rápidos y POWERED BY BOTIVA.',
  },
  {
    id: 'widget-preview-embed',
    file: 'widget-preview-embed.png',
    title: 'Vista previa — embed y capacidades',
    screen: '/dashboard/widget-preview',
    ragDescription:
      'Referencia UI BotIvA — Vista previa del widget (parte inferior). Tarjetas: info general del agente (Tools, Skills, Modo estricto, Almacenamiento, MCP habilitadas), Sub-agentes (nombre, modelo, sync), Resumen de capacidades (grid Tipo/Modelo/MCP/Built-in/RAG/Vision/Skills/Sub-agentes/Atajos), Modelo (Vertex AI), MCP Tools (HubSpot CRM sincronizado, acciones Create Contact/Deal, built-in slack/google-sheets/webhook), tarjeta Embed con texto "Copia este snippet para incrustar el widget" y código script widget.js + AgentFlowhub.init con agentId, widgetId, host y token.',
  },
  {
    id: 'widget-builder',
    file: 'widget-builder-identity.png',
    title: 'Widget builder — paso 1 Identidad',
    screen: '/dashboard/widget-builder',
    ragDescription:
      'Referencia UI BotIvA — Widget Builder paso 1 de 4 (Identidad). Sidebar: Identidad/Apariencia/Comportamiento/Publicar. Título "Widget Builder", campo Nombre del widget, toggle "Widget multiagente avanzado" (Business/Enterprise). Grilla de agentes con buscador, tarjetas con modelo (Gemini), badges tools/MCP/RAG/sub-agentes; agente seleccionado con borde teal y check. Tip de diseño abajo. Botones Anterior/Siguiente.',
  },
  {
    id: 'widget-builder-appearance-branding',
    file: 'widget-builder-appearance-branding.png',
    title: 'Widget builder — paso 2 Apariencia (marca)',
    screen: '/dashboard/widget-builder',
    ragDescription:
      'Referencia UI BotIvA — Widget Builder paso 2 de 4 (Apariencia). Sidebar con Apariencia activa. Sección Marca visual: color principal #006B7D, presets teal/verde/azul/morado/rosa/naranja, tema Claro/Oscuro. Textos del chat: título BotIvA Assistant, subtítulo, mensaje bienvenida, hint botón flotante. Avatar y forma del panel. Vista previa en vivo a la derecha con header teal, chat mock y launcher abajo derecha.',
  },
  {
    id: 'widget-builder-appearance-controls',
    file: 'widget-builder-appearance-controls.png',
    title: 'Widget builder — paso 2 Apariencia (controles)',
    screen: '/dashboard/widget-builder',
    ragDescription:
      'Referencia UI BotIvA — Widget Builder paso 2 Apariencia (parte inferior). Ubicación en pantalla: grid 3×3 de posiciones del botón flotante (Abajo derecha seleccionada). Controles visibles con toggles: Adjuntar archivos 📎, Micrófono STT, Lectura en voz alta TTS, Abrir al cargar, Cerrar launcher X. Preview en vivo refleja toggles en barra de input. Botones Anterior y Siguiente.',
  },
  {
    id: 'widget-builder-behavior-handoff',
    file: 'widget-builder-behavior-handoff.png',
    title: 'Widget builder — paso 3 Comportamiento (escalado)',
    screen: '/dashboard/widget-builder',
    ragDescription:
      'Referencia UI BotIvA — Widget Builder paso 3 de 4 (Comportamiento). Sidebar Comportamiento activa. WhatsApp para atención humana (toggle ON, número operador). Botón «Hablar con una persona» (toggle ON, destino Webhook+Slack, espera 5 min antes de ofrecer WhatsApp). Aviso de privacidad en pie del chat (checkbox, texto aviso, enlace Política de Privacidad, URL https). Tip de diseño sobre mensajes y escalado.',
  },
  {
    id: 'widget-builder-behavior-extras',
    file: 'widget-builder-behavior-extras.png',
    title: 'Widget builder — paso 3 Comportamiento (extras)',
    screen: '/dashboard/widget-builder',
    ragDescription:
      'Referencia UI BotIvA — Widget Builder paso 3 Comportamiento (parte inferior). Encuesta de satisfacción al cerrar chat (desactivada). Funcionalidades extra: toggles Abrir automáticamente, Mostrar X launcher, adjuntar, micrófono, lectura en voz alta (sync en vivo vía token embed). Sección SHORTCUTS DEL WIDGET con botones Sugerir con AI y + Agregar; estado vacío "Sin shortcuts". Botones Anterior y Siguiente.',
  },
  {
    id: 'agent-detail-general',
    file: 'agent-detail-general.png',
    title: 'Ficha agente — General',
    screen: '/dashboard/agents/{id}',
    ragDescription:
      'Referencia UI BotIvA — Detalle de agente, pestaña General (1/8). Cabecera «< Mis agentes», nombre agente, badge Activo, modelo gemini, Hub sync. Sidebar: General/Reglas/FAQ/Herramientas/Almacén/Sub-agentes/Tareas/WhatsApp. Información básica: nombre, descripción, token público widget, modo solo propósito ON, memoria persistente activada Sync OK.',
  },
  {
    id: 'agent-detail-rules',
    file: 'agent-detail-rules.png',
    title: 'Ficha agente — Reglas',
    screen: '/dashboard/agents/{id}',
    ragDescription:
      'Referencia UI BotIvA — Detalle agente pestaña Reglas (2/8). Título REGLAS DE COMPORTAMIENTO Y FLUJO. Explica prioridad, tono, reclamos, fallback integrados al prompt. Botones + Agregar regla y Guardar reglas. Estado vacío «Sin reglas configuradas aún».',
  },
  {
    id: 'agent-detail-faq',
    file: 'agent-detail-faq.png',
    title: 'Ficha agente — FAQ',
    screen: '/dashboard/agents/{id}',
    ragDescription:
      'Referencia UI BotIvA — Detalle agente pestaña FAQ (3/8). Preguntas frecuentes Q/A al system prompt. + Agregar FAQ. Sección Candidatas desde el widget (preguntas repetidas sin FAQ formal). Lista con contador repeticiones, botones Crear FAQ y Eliminar.',
  },
  {
    id: 'agent-detail-tools',
    file: 'agent-detail-tools.png',
    title: 'Ficha agente — Herramientas',
    screen: '/dashboard/agents/{id}',
    ragDescription:
      'Referencia UI BotIvA — Detalle agente pestaña Herramientas (4/8). Resumen cuentas MCP y tools del plan. Paso 1 Conectar cuenta: tarjetas Gmail, HubSpot, Calendar, Slack, Maps, MongoDB, PostgreSQL con Conectar. Plan actual business. Cuentas conectadas y enabledMcpToolIds.',
  },
  {
    id: 'agent-detail-rag',
    file: 'agent-detail-rag.png',
    title: 'Ficha agente — Almacén (RAG)',
    screen: '/dashboard/agents/{id}',
    ragDescription:
      'Referencia UI BotIvA — Detalle agente pestaña Almacén (5/8). Almacenamiento base de conocimiento: PDF, Word, imágenes OCR, TXT, CSV, JSON. Toggle almacenamiento desactivado. Métricas: Fuentes RAG, Vectores hub, Memorias chat, Contextos widget, Retención días.',
  },
  {
    id: 'agent-detail-subagents',
    file: 'agent-detail-subagents.png',
    title: 'Ficha agente — Sub-agentes',
    screen: '/dashboard/agents/{id}',
    ragDescription:
      'Referencia UI BotIvA — Detalle agente pestaña Sub-agentes (6/8). Orquestación y sub-agentes 0/58. Botón + Agregar sub-agente. Estado vacío delegar subtareas a especialistas vinculados.',
  },
  {
    id: 'agent-detail-tasks',
    file: 'agent-detail-tasks.png',
    title: 'Ficha agente — Tareas programadas',
    screen: '/dashboard/agents/{id}',
    ragDescription:
      'Referencia UI BotIvA — Detalle agente pestaña Tareas (7/8). Tareas Programadas (0). Flows automáticos webhook/email, zona America/Bogota. Botón + Nueva tarea. Estado vacío sin cron configurado.',
  },
  {
    id: 'agent-detail-whatsapp',
    file: 'agent-detail-whatsapp.png',
    title: 'Ficha agente — WhatsApp',
    screen: '/dashboard/agents/{id}',
    ragDescription:
      'Referencia UI BotIvA — Detalle agente pestaña WhatsApp (8/8). WhatsApp Business Cloud API desconectado. Número que envía/recibe handoff sin configurar. Paso 1 webhook Meta: callback botiva.space/api/whatsapp/webhook, verify token, suscribir messages.',
  },
];

export function mathAisUiReferencePublicPath(file: string): string {
  return `${PUBLIC_PATH_PREFIX}/${file}`;
}

export function mathAisUiReferencePublicUrl(file: string, appOrigin?: string): string {
  const path = mathAisUiReferencePublicPath(file);
  const base = (appOrigin || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export function mathAisUiReferenceRagBlocks(appOrigin?: string): Array<{
  name: string;
  content: string;
}> {
  return MATH_AIS_UI_REFERENCE_MANIFEST.map((entry) => {
    const url = mathAisUiReferencePublicUrl(entry.file, appOrigin);
    return {
      name: `Ref. UI BotIvA — ${entry.title}`,
      content: [
        `# ${entry.title}`,
        `Pantalla: ${entry.screen}`,
        `URL referencia: ${url}`,
        `Archivo: public/assets/platform-ui-ref/${entry.file}`,
        '',
        entry.ragDescription,
        '',
        'Usar para comparar si una captura del usuario coincide con UI BotIvA o es contenido externo.',
      ].join('\n'),
    };
  });
}

/** Mapa id → URL pública (útil en logs y scripts). */
export function mathAisUiReferenceUrlMap(appOrigin?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of MATH_AIS_UI_REFERENCE_MANIFEST) {
    out[entry.id] = mathAisUiReferencePublicUrl(entry.file, appOrigin);
  }
  return out;
}
