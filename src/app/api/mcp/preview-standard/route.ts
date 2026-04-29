/**
 * POST /api/mcp/preview-standard
 * Fase 3: endpoint retirado en landing (MCP interno unificado en AIBackHub).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/mcp-landing-auth';

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }
  return NextResponse.json(
    {
      error:
        'preview-standard está retirado en esta versión (Fase 3 MCP interno unificado).',
    },
    { status: 410 },
  );
}
