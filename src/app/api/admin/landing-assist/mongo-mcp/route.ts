/**
 * GET  — estado MCP Mongo de Math-ais
 * POST — crear/actualizar conexión (solo admin; URI en body, no se loguea)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import {
  ensureAssistMongoMcpConnection,
  getAssistMongoMcpStatus,
  resolveAssistMongoUri,
} from '@/lib/assist-mongo-mcp-service';

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  try {
    const status = await getAssistMongoMcpStatus();
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al leer MCP Mongo.' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    connectionUri?: string;
    allowedDatabases?: string;
  };

  const fromEnv = resolveAssistMongoUri();
  const connectionUri = String(body.connectionUri || fromEnv || '').trim();
  if (!connectionUri) {
    return NextResponse.json(
      {
        error:
          'Falta connectionUri en el body o ASSIST_MONGO_URI en el servidor (solo lectura recomendado).',
      },
      { status: 400 },
    );
  }

  try {
    const result = await ensureAssistMongoMcpConnection({
      connectionUri,
      allowedDatabases: body.allowedDatabases?.trim(),
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al configurar MCP Mongo.' },
      { status: 500 },
    );
  }
}
