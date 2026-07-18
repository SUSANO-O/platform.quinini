/**
 * GET  — estado MCP API REST de Math-ais
 * POST — crear/actualizar conexión botiva_api en AIBackHub
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import {
  ensureAssistApiMcpConnection,
  getAssistApiMcpStatus,
  resolveAssistLandingInternalUrl,
} from '@/lib/assist-api-mcp-service';

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  try {
    const status = await getAssistApiMcpStatus();
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al leer MCP API.' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { landingInternalUrl?: string };

  try {
    const result = await ensureAssistApiMcpConnection({
      landingInternalUrl: body.landingInternalUrl?.trim() || resolveAssistLandingInternalUrl(),
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al configurar MCP API.' },
      { status: 500 },
    );
  }
}
