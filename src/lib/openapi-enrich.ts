/** Enriquece OpenAPI en el dashboard (misma lógica que API-REST-AGENT-FLOW/server/lib/openapi-tagging.ts). */

type OpenApiOperation = Record<string, unknown> & {
  tags?: string[];
  summary?: string;
  description?: string;
  'x-displayOrder'?: number;
};

export type OpenApiSpec = Record<string, unknown> & {
  info?: Record<string, unknown>;
  paths?: Record<string, Record<string, OpenApiOperation>>;
  tags?: Array<{ name: string; description?: string }>;
};

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

const API_TAGS = {
  auth: '01 · Autenticación',
  system: '02 · Sistema',
  agents: '10 · Agentes',
  chat: '11 · Chat',
  skills: '12 · Skills',
  rag: '20 · RAG',
  mcp: '21 · MCP',
  widgets: '30 · Widgets',
  conversations: '31 · Conversaciones',
  audit: '32 · Auditoría',
} as const;

const TAG_DEFINITIONS = [
  { name: API_TAGS.auth, description: 'Claves API, token inicial y gestión de afapi_.' },
  { name: API_TAGS.system, description: 'Health check y disponibilidad del servicio.' },
  { name: API_TAGS.agents, description: 'Crear, leer, actualizar y eliminar agentes.' },
  { name: API_TAGS.chat, description: 'Inferencia programática (equivalente al widget).' },
  { name: API_TAGS.skills, description: 'Catálogo global y skills activas por agente.' },
  { name: API_TAGS.rag, description: 'Fuentes, uploads, embeddings y estadísticas.' },
  { name: API_TAGS.mcp, description: 'Conexiones, sync y catálogo de integraciones.' },
  { name: API_TAGS.widgets, description: 'Widget builder, apariencia y multi-agente.' },
  { name: API_TAGS.conversations, description: 'Historial y transcripts de sesiones.' },
  { name: API_TAGS.audit, description: 'Registro de uso de la API REST.' },
];

const TAG_GROUPS = [
  {
    name: 'Primeros pasos',
    description: 'Autenticación y estado del servicio',
    tags: [API_TAGS.auth, API_TAGS.system],
  },
  {
    name: 'Agentes e IA',
    description: 'Agentes, chat y skills',
    tags: [API_TAGS.agents, API_TAGS.chat, API_TAGS.skills],
  },
  {
    name: 'Conocimiento e integraciones',
    description: 'RAG y MCP',
    tags: [API_TAGS.rag, API_TAGS.mcp],
  },
  {
    name: 'Widgets y datos',
    description: 'Widgets, conversaciones y auditoría',
    tags: [API_TAGS.widgets, API_TAGS.conversations, API_TAGS.audit],
  },
];

type NavEntry = { tag: string; summary: string; order: number };

const NAV: Record<string, Partial<Record<string, NavEntry>>> = {
  '/health': { get: { tag: API_TAGS.system, summary: 'Health check', order: 1 } },
  '/auth/token': { post: { tag: API_TAGS.auth, summary: 'Obtener clave API', order: 1 } },
  '/auth/keys': {
    get: { tag: API_TAGS.auth, summary: 'Listar claves', order: 2 },
    post: { tag: API_TAGS.auth, summary: 'Crear clave', order: 3 },
  },
  '/auth/keys/{id}': { delete: { tag: API_TAGS.auth, summary: 'Revocar clave', order: 4 } },
  '/account/usage': { get: { tag: API_TAGS.auth, summary: 'Uso y límites (usage)', order: 5 } },
  '/agents': {
    get: { tag: API_TAGS.agents, summary: 'Listar agentes', order: 1 },
    post: { tag: API_TAGS.agents, summary: 'Crear agente', order: 2 },
  },
  '/agents/{id}': {
    get: { tag: API_TAGS.agents, summary: 'Obtener agente', order: 3 },
    put: { tag: API_TAGS.agents, summary: 'Actualizar agente', order: 4 },
    delete: { tag: API_TAGS.agents, summary: 'Eliminar agente', order: 5 },
  },
  '/agents/{id}/chat': { post: { tag: API_TAGS.chat, summary: 'Enviar mensaje (chat)', order: 1 } },
  '/skills/catalog': { get: { tag: API_TAGS.skills, summary: 'Catálogo de skills', order: 1 } },
  '/skills/{id}': { get: { tag: API_TAGS.skills, summary: 'Skill por ID', order: 2 } },
  '/agents/{id}/skills': {
    get: { tag: API_TAGS.skills, summary: 'Skills del agente', order: 3 },
    put: { tag: API_TAGS.skills, summary: 'Reemplazar skills', order: 4 },
    patch: { tag: API_TAGS.skills, summary: 'Activar/desactivar skills', order: 5 },
  },
  '/agents/{id}/rag/sources': {
    get: { tag: API_TAGS.rag, summary: 'Listar fuentes RAG', order: 1 },
    post: { tag: API_TAGS.rag, summary: 'Agregar fuente text/url', order: 2 },
    delete: { tag: API_TAGS.rag, summary: 'Eliminar fuente (índice)', order: 4 },
  },
  '/agents/{id}/rag/sources/{fileId}': {
    delete: { tag: API_TAGS.rag, summary: 'Eliminar archivo RAG', order: 5 },
  },
  '/agents/{id}/rag/upload': { post: { tag: API_TAGS.rag, summary: 'Subir archivo RAG', order: 3 } },
  '/agents/{id}/rag/stats': { get: { tag: API_TAGS.rag, summary: 'Estadísticas RAG', order: 6 } },
  '/agents/{id}/rag': { patch: { tag: API_TAGS.rag, summary: 'Activar/desactivar RAG', order: 7 } },
  '/mcp/catalog': { get: { tag: API_TAGS.mcp, summary: 'Catálogo MCP global', order: 1 } },
  '/agents/{id}/mcp/connections': {
    get: { tag: API_TAGS.mcp, summary: 'Listar conexiones MCP', order: 2 },
    post: { tag: API_TAGS.mcp, summary: 'Crear conexión MCP', order: 3 },
  },
  '/agents/{id}/mcp/connections/{connectionId}': {
    patch: { tag: API_TAGS.mcp, summary: 'Actualizar credenciales MCP', order: 4 },
    delete: { tag: API_TAGS.mcp, summary: 'Eliminar conexión MCP', order: 5 },
  },
  '/agents/{id}/mcp/connections/{connectionId}/sync': {
    post: { tag: API_TAGS.mcp, summary: 'Sincronizar conexión MCP', order: 6 },
  },
  '/agents/{id}/mcp/tools': { get: { tag: API_TAGS.mcp, summary: 'Tools MCP del agente', order: 7 } },
  '/widgets': {
    get: { tag: API_TAGS.widgets, summary: 'Listar widgets', order: 1 },
    post: { tag: API_TAGS.widgets, summary: 'Crear widget', order: 2 },
  },
  '/widgets/{id}': {
    get: { tag: API_TAGS.widgets, summary: 'Obtener widget', order: 3 },
    patch: { tag: API_TAGS.widgets, summary: 'Actualizar widget', order: 4 },
    delete: { tag: API_TAGS.widgets, summary: 'Eliminar widget', order: 5 },
  },
  '/conversations': {
    get: { tag: API_TAGS.conversations, summary: 'Historial de conversaciones', order: 1 },
  },
  '/conversations/{sessionId}': {
    get: { tag: API_TAGS.conversations, summary: 'Transcript de sesión', order: 2 },
  },
  '/audit': { get: { tag: API_TAGS.audit, summary: 'Audit log', order: 1 } },
};

function fallbackTag(path: string): string {
  if (path === '/health') return API_TAGS.system;
  if (path.startsWith('/auth')) return API_TAGS.auth;
  if (path.startsWith('/account')) return API_TAGS.auth;
  if (path.endsWith('/chat')) return API_TAGS.chat;
  if (path.includes('/rag')) return API_TAGS.rag;
  if (path.includes('/mcp') || path === '/mcp/catalog') return API_TAGS.mcp;
  if (path.includes('/skills') || path.startsWith('/skills')) return API_TAGS.skills;
  if (path.startsWith('/agents')) return API_TAGS.agents;
  if (path.startsWith('/widgets')) return API_TAGS.widgets;
  if (path.startsWith('/conversations')) return API_TAGS.conversations;
  if (path.startsWith('/audit')) return API_TAGS.audit;
  return API_TAGS.agents;
}

function resolveNav(path: string, method: string, operation: OpenApiOperation): NavEntry {
  const entry = NAV[path]?.[method.toLowerCase()];
  const longSummary =
    typeof operation.summary === 'string' && operation.summary.trim()
      ? operation.summary.trim()
      : `${method.toUpperCase()} ${path}`;

  if (entry) return entry;

  return {
    tag: fallbackTag(path),
    summary: longSummary.length > 42 ? `${longSummary.slice(0, 39)}…` : longSummary,
    order: 99,
  };
}

export function enrichOpenApiSpec(spec: OpenApiSpec): OpenApiSpec {
  const out = structuredClone(spec) as OpenApiSpec;
  if (!out.paths) out.paths = {};

  for (const [path, methods] of Object.entries(NAV)) {
    if (!out.paths[path]) out.paths[path] = {};
    for (const [method, nav] of Object.entries(methods)) {
      if (!nav) continue;
      const key = method.toLowerCase();
      if (!out.paths[path][key]) {
        out.paths[path][key] = {
          summary: nav.summary,
          tags: [nav.tag],
          responses: { '200': { description: 'OK' } },
        };
      }
    }
  }

  const paths = out.paths;

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, rawOp] of Object.entries(methods)) {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !rawOp || typeof rawOp !== 'object') continue;
      const operation = rawOp as OpenApiOperation;
      const nav = resolveNav(path, method, operation);
      const longText =
        typeof operation.description === 'string' && operation.description.trim()
          ? operation.description.trim()
          : typeof operation.summary === 'string'
            ? operation.summary.trim()
            : '';

      operation.tags = [nav.tag];
      operation.summary = nav.summary;
      operation['x-displayOrder'] = nav.order;
      if (longText && longText !== nav.summary) {
        operation.description = longText;
      }
    }
  }

  out.tags = TAG_DEFINITIONS;
  out['x-tagGroups'] = TAG_GROUPS;

  if (out.info && typeof out.info === 'object') {
    out.info.version = '2.0.0';
    out.info.title = 'BotIvA API REST';
  }

  return out;
}
