import { NextRequest, NextResponse } from 'next/server';
import { AGENTFLOW_API_EMBED_PREFIX, resolveAgentflowApiUrl } from '@/lib/agentflow-api-url';
import { AGENTFLOW_API_EMBED_CSP } from '@/lib/agentflow-api-embed-csp';
import { requireApiAccessRequest } from '@/lib/require-api-access';

function buildUpstreamUrl(pathSegments: string[], search: string): string {
  const apiBase = resolveAgentflowApiUrl();
  const path = pathSegments.filter(Boolean).join('/');
  return `${apiBase}/${path}${search}`;
}

function rewriteLocation(location: string, apiBase: string): string {
  try {
    if (location.startsWith(apiBase)) {
      return `${AGENTFLOW_API_EMBED_PREFIX}${location.slice(apiBase.length)}`;
    }
    if (location.startsWith('http://') || location.startsWith('https://')) {
      const url = new URL(location);
      const apiOrigin = new URL(apiBase).origin;
      if (url.origin === apiOrigin) {
        return `${AGENTFLOW_API_EMBED_PREFIX}${url.pathname}${url.search}`;
      }
      return location;
    }
    if (location.startsWith('/')) {
      return `${AGENTFLOW_API_EMBED_PREFIX}${location}`;
    }
  } catch {
    /* noop */
  }
  return location;
}

function injectEmbedFetchShim(html: string): string {
  const shim = `<script>(function(){var p=${JSON.stringify(AGENTFLOW_API_EMBED_PREFIX)};var f=window.fetch;window.fetch=function(u,i){if(typeof u==='string'&&u.charAt(0)==='/'&&!u.startsWith(p+'/'))u=p+u;return f.call(this,u,i);};})();</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${shim}</head>`);
  }
  return shim + html;
}

function patchDocsHtml(html: string): string {
  let out = injectEmbedFetchShim(html);
  out = out.replaceAll('href="/docs', `href="${AGENTFLOW_API_EMBED_PREFIX}/docs`);
  out = out.replace(
    "var redirect = params.get('redirect') || '/docs/';",
    `var redirect = params.get('redirect') || '${AGENTFLOW_API_EMBED_PREFIX}/docs/';`,
  );
  out = out.replace(
    "window.location.href = redirect.startsWith('/') ? redirect : '/docs/';",
    `window.location.href = redirect.startsWith('${AGENTFLOW_API_EMBED_PREFIX}') ? redirect : '${AGENTFLOW_API_EMBED_PREFIX}' + (redirect.startsWith('/') ? redirect : '/docs/');`,
  );
  out = out.replace(
    "var specUrl = origin + '/openapi.json';",
    `var specUrl = '${AGENTFLOW_API_EMBED_PREFIX}/openapi.json';`,
  );
  out = out.replace(
    "var serverUrl = origin + '/api/v1';",
    `var serverUrl = '${AGENTFLOW_API_EMBED_PREFIX}/api/v1';`,
  );
  return out;
}

async function proxyToAgentflowApi(req: NextRequest, pathSegments: string[] | undefined) {
  const apiBase = resolveAgentflowApiUrl();
  const segments = pathSegments ?? [];
  const target = buildUpstreamUrl(segments, req.nextUrl.search);

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') return;
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const outHeaders = new Headers();

  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === 'transfer-encoding' ||
      lower === 'content-encoding' ||
      lower === 'content-length' ||
      lower === 'content-security-policy' ||
      lower === 'x-frame-options'
    ) {
      return;
    }
    if (lower === 'location') {
      outHeaders.set('location', rewriteLocation(value, apiBase));
      return;
    }
    outHeaders.append(key, value);
  });

  const contentType = upstream.headers.get('content-type') ?? '';

  if (contentType.includes('text/html')) {
    const html = patchDocsHtml(await upstream.text());
    outHeaders.set('Content-Security-Policy', AGENTFLOW_API_EMBED_CSP);
    outHeaders.set('X-Frame-Options', 'SAMEORIGIN');
    return new NextResponse(html, { status: upstream.status, headers: outHeaders });
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers: outHeaders });
}

type RouteContext = { params: Promise<{ path?: string[] }> };

async function handle(req: NextRequest, context: RouteContext) {
  const denied = await requireApiAccessRequest(req);
  if (denied) return denied;
  const { path } = await context.params;
  return proxyToAgentflowApi(req, path);
}

export async function GET(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function OPTIONS(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}
