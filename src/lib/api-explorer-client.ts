import { AGENTFLOW_API_EMBED_PREFIX } from '@/lib/agentflow-api-url';
import { enrichOpenApiSpec, type OpenApiSpec } from '@/lib/openapi-enrich';
import { normalizeApiPath, parseOpenApiSpec, type ParsedOpenApi } from '@/lib/openapi-explorer';

const STORAGE_KEY = 'botiva_api_explorer_key';

export type ApiExplorerResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  bodyText: string;
  error?: string;
};

export function toEmbedProxyUrl(apiPath: string): string {
  const normalized = normalizeApiPath(apiPath);
  return `${AGENTFLOW_API_EMBED_PREFIX}${normalized}`;
}

export async function fetchOpenApiSpec(): Promise<ParsedOpenApi & { rawComponents?: Record<string, unknown> }> {
  const res = await fetch(`${AGENTFLOW_API_EMBED_PREFIX}/openapi.json`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`No se pudo cargar OpenAPI (${res.status})`);
  }
  const raw = (await res.json()) as OpenApiSpec & {
    components?: { schemas?: Record<string, unknown> };
  };
  const spec = enrichOpenApiSpec(raw) as typeof raw;
  const parsed = parseOpenApiSpec(spec);
  return { ...parsed, rawComponents: spec.components?.schemas };
}

export function loadStoredApiKey(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(STORAGE_KEY)?.trim() ?? '';
}

export function storeApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, key.trim());
}

export async function provisionApiKey(force = false): Promise<{
  apiKey?: string;
  hasExistingKeys?: boolean;
  message?: string;
  warning?: string;
}> {
  const res = await fetch(toEmbedProxyUrl('/api/v1/docs/provision-key'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    data?: {
      apiKey?: string;
      hasExistingKeys?: boolean;
      message?: string;
      warning?: string;
    };
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? 'No se pudo obtener la clave API');
  }
  return data.data ?? {};
}

function isHtmlResponse(text: string, contentType: string): boolean {
  return contentType.includes('text/html') || text.trimStart().startsWith('<!DOCTYPE') || text.includes('<html');
}

export async function sendExplorerRequest(opts: {
  url: string;
  method: string;
  apiKey: string;
  body?: string;
  extraHeaders?: Record<string, string>;
}): Promise<ApiExplorerResponse> {
  const started = performance.now();
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...opts.extraHeaders,
  };
  if (opts.apiKey.trim()) {
    headers['X-Api-Key'] = opts.apiKey.trim();
  }

  const init: RequestInit = {
    method: opts.method.toUpperCase(),
    credentials: 'include',
    headers,
    cache: 'no-store',
  };

  if (opts.body && !['GET', 'HEAD'].includes(init.method ?? '')) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    init.body = opts.body;
  }

  const target = toEmbedProxyUrl(opts.url);

  try {
    const res = await fetch(target, init);
    const durationMs = Math.round(performance.now() - started);
    const bodyText = await res.text();
    const contentType = res.headers.get('content-type') ?? '';
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      outHeaders[key] = value;
    });

    if (isHtmlResponse(bodyText, contentType)) {
      return {
        ok: false,
        status: res.status,
        statusText: res.statusText,
        durationMs,
        headers: outHeaders,
        bodyText: '',
        error:
          res.status === 404
            ? `Ruta no encontrada (${target}). Verifica que el API REST esté activo.`
            : 'La respuesta no es JSON (¿proxy o API caído?).',
      };
    }

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      durationMs,
      headers: outHeaders,
      bodyText,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      statusText: 'Error de red',
      durationMs: Math.round(performance.now() - started),
      headers: {},
      bodyText: '',
      error: err instanceof Error ? err.message : 'Failed to fetch',
    };
  }
}
