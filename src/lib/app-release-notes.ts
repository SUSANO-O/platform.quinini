/**
 * Notas de versión mostradas en /dashboard/whats-new.
 * Solo entradas con audience: 'all' se muestran en la vista pública del panel.
 * Mantener APP_VERSION en sync con package.json.
 */

export const APP_VERSION = '1.1.0';

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
