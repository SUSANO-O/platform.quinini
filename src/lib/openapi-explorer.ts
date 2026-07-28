/** Parseo del OpenAPI enriquecido (x-tagGroups, tags numerados) para el explorador del dashboard. */

/** Prefijo relativo de la API v1 (siempre vía proxy same-origin). */
export const API_V1_PREFIX = '/api/v1';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type OpenApiParameter = {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: Record<string, unknown>;
};

export type ApiOperation = {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  tag: string;
  order: number;
  parameters: OpenApiParameter[];
  requestBodySchema?: Record<string, unknown>;
  requestBodyRequired?: boolean;
  requiresAuth: boolean;
};

export type ApiExplorerGroup = {
  name: string;
  description?: string;
  tags: string[];
  operations: ApiOperation[];
};

export type ParsedOpenApi = {
  title: string;
  version: string;
  serverPath: string;
  groups: ApiExplorerGroup[];
  operations: ApiOperation[];
};

type OpenApiOperation = Record<string, unknown> & {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
  security?: unknown[];
  'x-displayOrder'?: number;
};

type OpenApiSpec = Record<string, unknown> & {
  info?: { title?: string; version?: string };
  servers?: Array<{ url?: string }>;
  paths?: Record<string, Record<string, OpenApiOperation>>;
  tags?: Array<{ name: string; description?: string }>;
  components?: { schemas?: Record<string, unknown> };
  'x-tagGroups'?: Array<{ name: string; description?: string; tags: string[] }>;
};

const HTTP_METHODS = new Set<HttpMethod>(['get', 'post', 'put', 'patch', 'delete']);

const METHOD_ORDER: Record<HttpMethod, number> = {
  get: 0,
  post: 1,
  put: 2,
  patch: 3,
  delete: 4,
};

function resolveRef(schema: Record<string, unknown>, components?: Record<string, unknown>): Record<string, unknown> {
  const ref = schema.$ref;
  if (typeof ref !== 'string' || !components) return schema;
  const name = ref.replace('#/components/schemas/', '');
  const resolved = components[name];
  return resolved && typeof resolved === 'object'
    ? resolveRef(resolved as Record<string, unknown>, components)
    : schema;
}

export function schemaToExample(
  schema: Record<string, unknown> | undefined,
  components?: Record<string, unknown>,
): unknown {
  if (!schema) return undefined;
  const s = resolveRef(schema, components);
  if (s.example !== undefined) return s.example;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];

  const type = s.type as string | undefined;
  if (type === 'object' && s.properties && typeof s.properties === 'object') {
    const props = s.properties as Record<string, Record<string, unknown>>;
    const required = Array.isArray(s.required) ? (s.required as string[]) : [];
    const out: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(props)) {
      if (required.includes(key) || required.length === 0) {
        out[key] = schemaToExample(propSchema, components);
      }
    }
    return out;
  }
  if (type === 'array') {
    const item = schemaToExample(s.items as Record<string, unknown>, components);
    return item === undefined ? [] : [item];
  }
  if (type === 'string') {
    if (s.format === 'email') return 'user@example.com';
    if (s.format === 'date-time') return new Date().toISOString();
    return '';
  }
  if (type === 'integer' || type === 'number') return 0;
  if (type === 'boolean') return false;
  return undefined;
}

function pickJsonSchema(op: OpenApiOperation, components?: Record<string, unknown>): Record<string, unknown> | undefined {
  const content = op.requestBody?.content;
  if (!content) return undefined;
  const json = content['application/json']?.schema;
  if (!json) return undefined;
  return resolveRef(json, components);
}

function operationRequiresAuth(op: OpenApiOperation, globalSecurity: unknown[] | undefined): boolean {
  if (Array.isArray(op.security)) {
    return op.security.length > 0;
  }
  return Array.isArray(globalSecurity) && globalSecurity.length > 0;
}

export function parseOpenApiSpec(spec: OpenApiSpec): ParsedOpenApi {
  const paths = spec.paths ?? {};
  const components = spec.components?.schemas;
  const globalSecurity = spec.security as unknown[] | undefined;
  const operations: ApiOperation[] = [];

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, raw] of Object.entries(methods)) {
      const m = method.toLowerCase() as HttpMethod;
      if (!HTTP_METHODS.has(m) || !raw || typeof raw !== 'object') continue;
      const op = raw as OpenApiOperation;
      const tag = op.tags?.[0] ?? 'Otros';
      const summary =
        typeof op.summary === 'string' && op.summary.trim()
          ? op.summary.trim()
          : `${m.toUpperCase()} ${path}`;

      operations.push({
        id: `${m} ${path}`,
        method: m,
        path,
        summary,
        description: typeof op.description === 'string' ? op.description : undefined,
        tag,
        order: typeof op['x-displayOrder'] === 'number' ? op['x-displayOrder'] : 99,
        parameters: Array.isArray(op.parameters) ? op.parameters : [],
        requestBodySchema: pickJsonSchema(op, components),
        requestBodyRequired: op.requestBody?.required ?? false,
        requiresAuth: operationRequiresAuth(op, globalSecurity),
      });
    }
  }

  operations.sort((a, b) => {
    if (a.tag !== b.tag) return a.tag.localeCompare(b.tag, 'es');
    if (a.order !== b.order) return a.order - b.order;
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return METHOD_ORDER[a.method] - METHOD_ORDER[b.method];
  });

  const tagGroups = spec['x-tagGroups'];
  const groups: ApiExplorerGroup[] = [];

  if (Array.isArray(tagGroups) && tagGroups.length > 0) {
    for (const group of tagGroups) {
      const tagSet = new Set(group.tags ?? []);
      const groupOps = operations.filter((op) => tagSet.has(op.tag));
      if (groupOps.length === 0) continue;
      groups.push({
        name: group.name,
        description: group.description,
        tags: group.tags ?? [],
        operations: groupOps,
      });
    }
  } else {
    const byTag = new Map<string, ApiOperation[]>();
    for (const op of operations) {
      const list = byTag.get(op.tag) ?? [];
      list.push(op);
      byTag.set(op.tag, list);
    }
    for (const [tag, ops] of byTag) {
      groups.push({ name: tag, tags: [tag], operations: ops });
    }
  }

  const serverPath = API_V1_PREFIX;

  return {
    title: spec.info?.title ?? 'API REST',
    version: spec.info?.version ?? '1.0.0',
    serverPath,
    groups,
    operations,
  };
}

export function normalizeApiPath(urlOrPath: string): string {
  const [pathPart, queryPart] = urlOrPath.split('?');
  let path = pathPart ?? urlOrPath;

  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      path = new URL(path).pathname;
    } catch {
      /* noop */
    }
  }

  if (!path.startsWith('/')) path = `${API_V1_PREFIX}/${path}`;
  if (!path.startsWith(API_V1_PREFIX)) {
    path = `${API_V1_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
  }

  return queryPart ? `${path}?${queryPart}` : path;
}

export function buildRequestUrl(
  path: string,
  pathParams: Record<string, string>,
  queryParams: Record<string, string>,
): string {
  let resolved = path;
  for (const [key, value] of Object.entries(pathParams)) {
    resolved = resolved.replace(`{${key}}`, encodeURIComponent(value));
  }

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (value.trim()) qs.set(key, value.trim());
  }
  const query = qs.toString();
  const apiPath = `${API_V1_PREFIX}${resolved}${query ? `?${query}` : ''}`;
  return normalizeApiPath(apiPath);
}

export function defaultPathParams(op: ApiOperation): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of op.parameters) {
    if (p.in === 'path') out[p.name] = '';
  }
  return out;
}

export function defaultQueryParams(op: ApiOperation): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of op.parameters) {
    if (p.in === 'query') out[p.name] = '';
  }
  return out;
}

export function defaultBodyJson(
  op: ApiOperation,
  components?: Record<string, unknown>,
): string {
  if (!op.requestBodySchema) return '';
  const example = schemaToExample(op.requestBodySchema, components);
  if (example === undefined) return '{\n  \n}';
  return JSON.stringify(example, null, 2);
}

export const METHOD_COLORS: Record<HttpMethod, { bg: string; text: string }> = {
  get: { bg: 'rgba(37, 99, 235, 0.12)', text: '#1d4ed8' },
  post: { bg: 'rgba(22, 163, 74, 0.12)', text: '#15803d' },
  put: { bg: 'rgba(234, 88, 12, 0.12)', text: '#c2410c' },
  patch: { bg: 'rgba(202, 138, 4, 0.14)', text: '#a16207' },
  delete: { bg: 'rgba(220, 38, 38, 0.12)', text: '#b91c1c' },
};
