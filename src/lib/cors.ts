/**
 * CORS helpers for API routes that are called cross-origin
 * (Widget API, embed scripts, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';

/** Get CORS headers for a given request origin */
export function getCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') || '';

  // Estos endpoints sirven al widget de chat embebible, que vive en sitios de
  // clientes arbitrarios. La identidad/seguridad la da el token `wt_`, no el
  // origen, así que reflejamos siempre el origin solicitante (compatible con
  // Allow-Credentials: true). Sin origin (same-origin/curl) cae a '*'.
  const allowOrigin = origin || '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-widget-token',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

/** Handle OPTIONS preflight */
export function handlePreflight(req: NextRequest): NextResponse | null {
  if (req.method !== 'OPTIONS') return null;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

/** Wrap a NextResponse with CORS headers */
export function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const headers = getCorsHeaders(req);
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}
