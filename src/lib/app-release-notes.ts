/**
 * Notas de versión mostradas en /dashboard/whats-new.
 * Solo entradas con audience: 'all' se muestran en la vista pública del panel.
 * Mantener APP_VERSION en sync con package.json.
 */

export const APP_VERSION = '1.3.0';

export type ReleaseNoteItem = {
  title: string;
  description: string;
  /** 'all' = visible para todos los usuarios del panel; 'internal' = solo changelog técnico */
  audience: 'all' | 'internal';
};

export type AppRelease = {
  version: string;
  date: string;
  title: string;
  summary: string;
  features: ReleaseNoteItem[];
  fixes: ReleaseNoteItem[];
};

export const APP_RELEASES: AppRelease[] = [
  {
    version: '1.3.0',
    date: '2026-08-25',
    title: 'Tickets desde el chat, sync con Jira y gráficos con color',
    summary:
      'Tus visitantes ya pueden abrir un ticket de soporte sin salir del chat (con fotos y video), el estado se sincroniza solo con Jira si lo usas, y el panel vuelve a tener color en sus gráficos.',
    features: [
      {
        audience: 'all',
        title: 'Ticket de soporte desde el widget',
        description:
          'Botón 🎫 dedicado junto al de enviar, o el propio asistente lo abre cuando detecta que el visitante quiere reportar un problema. Permite adjuntar hasta 3 imágenes y un link de video.',
      },
      {
        audience: 'all',
        title: 'Escalación a Slack por agente',
        description:
          'Nueva skill "Escalación Slack (tickets)": el agente puede crear, comentar, consultar y cerrar tickets directo en un canal de Slack, sin necesidad de Jira.',
      },
      {
        audience: 'all',
        title: 'Sincronización Jira → Slack',
        description:
          'Si tu equipo de desarrollo usa Jira, el estado del ticket en Slack se actualiza solo cuando cambia el issue vinculado (vía Automation de Jira).',
      },
      {
        audience: 'all',
        title: 'Gráfico de conversaciones: barras u onda',
        description:
          'Nuevo selector en el gráfico del panel para verlo como barras o como línea/área — el que prefieras.',
      },
      {
        audience: 'internal',
        title: 'Endpoint de ticket sin LLM',
        description: 'POST /api/widgets/[id]/ticket + POST /api/mcp/widget-ticket en AIBackHub, para creación determinística desde el formulario.',
      },
      {
        audience: 'internal',
        title: 'Webhook Jira → Slack',
        description: 'POST /webhooks/jira/issue-updated, autenticado con secreto propio, fuera de /api.',
      },
    ],
    fixes: [
      {
        audience: 'all',
        title: 'Filtro de fechas del panel',
        description:
          'Elegir "Hoy" o "Últimos 7 días" ahora sí cambia satisfacción, sentiment y tasas de escalamiento — antes solo se filtraba por mes completo.',
      },
      {
        audience: 'all',
        title: 'Color de vuelta en los gráficos',
        description:
          'El gráfico de conversaciones y las tarjetas de uso vuelven a tener color (antes monocromo) para leerse mejor de un vistazo.',
      },
      {
        audience: 'all',
        title: 'Pestaña Herramientas del agente',
        description:
          'Buscador de herramientas, integraciones colapsables y contador "seleccionadas/total" por conexión (Slack, HubSpot, Jira, etc.).',
      },
      {
        audience: 'internal',
        title: 'Sync de conexión Slack',
        description: 'runMcpConnectionSync nunca tenía implementado el caso "slack" — quedaba en pending para siempre.',
      },
      {
        audience: 'internal',
        title: 'Skills con snapshot congelado',
        description: 'El catálogo de skills en Mongo solo insertaba IDs nuevos, nunca actualizaba prompt_extension de los existentes.',
      },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-08-12',
    title: 'Panel más claro, widget más cómodo y botones más amables',
    summary:
      'El dashboard gana un look negro y blanco más ordenado, gráficos más legibles, botones grises fáciles de pulsar y un chat embebido con más aire y mejor feedback mientras responde.',
    features: [
      {
        audience: 'all',
        title: 'Dashboard negro y blanco',
        description:
          'Paleta más limpia en el panel: fondos claros, acentos en negro y gráficos en escala de grises para leer métricas sin distracciones.',
      },
      {
        audience: 'all',
        title: 'Botones grises estilo app moderna',
        description:
          'Los botones principales del panel usan grises suaves en lugar de negro puro, con forma de píldora y transiciones discretas.',
      },
      {
        audience: 'all',
        title: 'Widget con más espacio y lectura premium',
        description:
          'Más separación entre mensajes, burbujas más cómodas y composer más claro para que el chat en tu web se sienta más cuidado.',
      },
      {
        audience: 'all',
        title: 'Feedback visual al consultar',
        description:
          'El borde animado al escribir o mientras el agente piensa es más visible y pegado al borde, para que sepas que está trabajando.',
      },
      {
        audience: 'all',
        title: 'Navegación móvil del panel',
        description:
          'Barra inferior con logo recortado, mejor safe-area y el asistente ya no se solapa con los controles del móvil.',
      },
      {
        audience: 'internal',
        title: 'Widget SDK 1.6.81',
        description:
          'build:widget sincroniza core.js, public/widget.js, assist.js e internal-assist-config (cache ?v=).',
      },
      {
        audience: 'internal',
        title: 'Tema MUI del dashboard',
        description: 'ThemeProvider con dashboard-mui-theme.ts (botones/chips grises, sin teal landing).',
      },
    ],
    fixes: [
      {
        audience: 'all',
        title: 'Selector de fechas del panel',
        description: 'Calendario y rangos más claros en las vistas de analítica.',
      },
      {
        audience: 'all',
        title: 'Planes de suscripción',
        description: 'Botones de upgrade alineados al nuevo estilo gris del panel.',
      },
      {
        audience: 'internal',
        title: 'Rollback documentado',
        description:
          'Ver CHANGELOG §1.2.0: Vercel → Promote deployment anterior; widget.js usa ?v= para invalidar caché.',
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-07-18',
    title: 'Asistente Math-ais más inteligente y navegación más fluida',
    summary:
      'Math-ais entiende mejor lo que ves en pantalla, te guía entre secciones del panel con un clic y ofrece consejos más precisos cuando configuras un agente.',
    features: [
      {
        audience: 'all',
        title: 'Visión de pantalla en el dashboard',
        description:
          'Si compartes una captura, Math-ais la compara con las pantallas del panel y te explica qué ves con más precisión (agentes, widgets, inbox, configuración, etc.).',
      },
      {
        audience: 'all',
        title: 'Ir a otra sección con Sí / No',
        description:
          'Cuando Math-ais te sugiere abrir otra parte del panel, puedes confirmar con botones y llegar sin recargar toda la página.',
      },
      {
        audience: 'all',
        title: 'Ayuda contextual al editar un agente',
        description:
          'En la ficha de un agente, Math-ais conoce su configuración actual (herramientas, RAG, FAQs, WhatsApp, widgets) y te sugiere mejoras según tu plan.',
      },
      {
        audience: 'all',
        title: 'Widget embebido más estable',
        description:
          'Mejoras de fiabilidad en el chat que instalas en tu web, para que tus visitantes tengan una experiencia más consistente.',
      },
      {
        audience: 'internal',
        title: 'Widget público vs asistente interno',
        description:
          'widget.js expone AgentFlowhub para embeds; assist.js usa __BIV solo en botiva.space.',
      },
      {
        audience: 'internal',
        title: 'Chat stream vía MCP directo',
        description: 'Nueva ruta stream-direct-mcp con trazas de latencia en admin.',
      },
    ],
    fixes: [
      {
        audience: 'all',
        title: 'Estabilidad general del panel',
        description: 'Correcciones que mejoran la fiabilidad del asistente y del widget en producción.',
      },
      {
        audience: 'internal',
        title: 'Build Vercel del widget',
        description: 'widget.js ya no incluye __BIV y pasa verify-build en cada deploy.',
      },
      {
        audience: 'internal',
        title: 'Tipos de latencia SSE',
        description: 'stream-direct-mcp registrado en WidgetChatLatencyPath.',
      },
      {
        audience: 'internal',
        title: 'Boot del asistente interno',
        description: 'window.__BIV.init es opcional hasta que assist.js termina de cargar.',
      },
    ],
  },
];

export const LATEST_RELEASE = APP_RELEASES[0]!;

export function publicReleaseNotes(release: AppRelease): {
  features: ReleaseNoteItem[];
  fixes: ReleaseNoteItem[];
} {
  return {
    features: release.features.filter((item) => item.audience === 'all'),
    fixes: release.fixes.filter((item) => item.audience === 'all'),
  };
}

export function formatReleaseDate(isoDate: string): string {
  try {
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString('es', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}
