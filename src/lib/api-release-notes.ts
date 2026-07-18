/**
 * Notas de versión de la API REST BotIvA (dashboard /dashboard/api).
 * Mantener API_VERSION en sync con API-REST-AGENT-FLOW/package.json y health.version.
 */

export const API_VERSION = '2.0.0';

export type ApiReleaseNoteItem = {
  title: string;
  description: string;
  /** 'all' = visible para todos los usuarios con acceso API */
  audience: 'all' | 'internal';
};

export type ApiRelease = {
  version: string;
  date: string;
  title: string;
  summary: string;
  features: ApiReleaseNoteItem[];
  fixes: ApiReleaseNoteItem[];
};

export const API_RELEASES: ApiRelease[] = [
  {
    version: '2.0.0',
    date: '2026-07-18',
    title: 'API REST completa para operar BotIvA sin dashboard',
    summary:
      'Puedes gestionar chat, conocimiento (RAG), integraciones MCP, agentes avanzados y widgets por HTTP, con la misma lógica de planes que el panel.',
    features: [
      {
        audience: 'all',
        title: 'Chat programático',
        description:
          'Envía mensajes a tus agentes con POST /agents/:id/chat, incluyendo historial y sesión, ideal para backends y automatizaciones.',
      },
      {
        audience: 'all',
        title: 'Knowledge base (RAG)',
        description:
          'Sube archivos, gestiona fuentes y consulta el estado de embeddings desde /agents/:id/rag/* sin abrir la ficha del agente.',
      },
      {
        audience: 'all',
        title: 'Integraciones MCP',
        description:
          'Catálogo, conexiones, herramientas y sincronización MCP expuestos en /mcp/catalog y /agents/:id/mcp/*.',
      },
      {
        audience: 'all',
        title: 'Agente avanzado por API',
        description:
          'Actualiza herramientas, fallbacks, FAQs, reglas de comportamiento y visión con PUT /agents/:id.',
      },
      {
        audience: 'all',
        title: 'Widget builder por API',
        description:
          'Configura multi-agente, pipeline, apariencia y soporte humano con PATCH /widgets/:id.',
      },
      {
        audience: 'all',
        title: 'Límites de plan en la API',
        description:
          'La API respeta tu plan: cupo de conversaciones, herramientas permitidas, RAG y widgets multi-agente (Business+).',
      },
      {
        audience: 'internal',
        title: 'Smokes y BDD por fase',
        description: 'Scripts smoke-agent-*.mjs y escenarios Cucumber @api-only en API-REST-AGENT-FLOW.',
      },
    ],
    fixes: [
      {
        audience: 'all',
        title: 'Acceso API Develop',
        description:
          'El plan API Develop tiene acceso REST nativo; Team+ y overrides admin siguen funcionando igual que en el panel.',
      },
      {
        audience: 'internal',
        title: 'plan-access alineado con landing',
        description: 'api_develop reconocido como plan API-only en canUseApiAccess.',
      },
    ],
  },
];

export const LATEST_API_RELEASE = API_RELEASES[0]!;

export function publicApiReleaseNotes(release: ApiRelease): {
  features: ApiReleaseNoteItem[];
  fixes: ApiReleaseNoteItem[];
} {
  return {
    features: release.features.filter((item) => item.audience === 'all'),
    fixes: release.fixes.filter((item) => item.audience === 'all'),
  };
}

export function formatApiReleaseDate(isoDate: string): string {
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
