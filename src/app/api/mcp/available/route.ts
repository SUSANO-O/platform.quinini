/**
 * GET /api/mcp/available
 *
 * Catálogo de integraciones MCP expuesto por AIBackHub (`GET /api/mcp/catalog`).
 * Usa BACKEND_URL (vía getAibackhubBaseUrl) y AIBACKHUB_API_KEY si está definida.
 */

import { NextResponse } from 'next/server';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';
import type { McpCatalogRow } from '@/lib/mcp-catalog-types';

export async function GET() {
  const base = getAibackhubBaseUrl();
  if (!base) {
    return NextResponse.json(
      {
        success: false,
        error: 'Falta BACKEND_URL en el entorno de la landing (AIBackHub).',
        catalog: [] as McpCatalogRow[],
      },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${base}/api/mcp/catalog`, {
      headers: hubCreateHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        typeof raw?.error === 'object' && raw?.error?.message
          ? String(raw.error.message)
          : typeof raw?.error === 'string'
            ? raw.error
            : `HTTP ${res.status}`;
      return NextResponse.json(
        {
          success: false,
          error: msg,
          catalog: [] as McpCatalogRow[],
          backendBase: base,
        },
        { status: 502 },
      );
    }

    const catalog: McpCatalogRow[] = raw?.data?.catalog ?? raw?.catalog ?? [];
    return NextResponse.json({
      success: true,
      catalog,
      backendBase: base,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        success: false,
        error: msg,
        catalog: [] as McpCatalogRow[],
        backendBase: base,
      },
      { status: 502 },
    );
  }
}
