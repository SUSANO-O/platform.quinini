/**
 * CORS helpers for API routes that are called cross-origin
 * (Widget API, embed scripts, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);

/** Get CORS headers for a given request origin */
export function getCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') || '';

  // In dev, allow any origin. In prod, check allowlist or same-site.
  const allowOrigin =
    process.env.NODE_ENV !== 'production' ||
    ALLOWED_ORIGINS.length === 0 ||
    ALLOWED_ORIGINS.includes('*') ||
    ALLOWED_ORIGINS.includes(origin)
      ? origin || '*'
      : '';

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
