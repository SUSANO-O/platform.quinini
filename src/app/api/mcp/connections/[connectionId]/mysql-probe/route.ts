/**
 * POST /api/mcp/connections/[connectionId]/mysql-probe?landingAgentId=…
 * "Probar como cliente X": cuántas filas vería el agente en cada tabla MySQL para una identidad dada.
 * Solo conteos (nunca filas). Mismo control de acceso que sync: sesión → agente propio → conexión suya.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';
import {
  getSessionUserId,
  getWritableLandingAgent,
  verifyConnectionBelongsToLandingAgent,
} from '@/lib/mcp-landing-auth';

type Params = { params: Promise<{ connectionId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const landingAgentId = req.nextUrl.searchParams.get('landingAgentId')?.trim();
  if (!landingAgentId) {
    return NextResponse.json({ error: 'Query landingAgentId es requerido.' }, { status: 400 });
  }
  const agent = await getWritableLandingAgent(landingAgentId, userId);
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado o no editable.' }, { status: 404 });

  const { connectionId } = await params;
  if (!(await verifyConnectionBelongsToLandingAgent(connectionId, landingAgentId))) {
    return NextResponse.json({ error: 'Conexión no encontrada para este agente.' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { identity?: unknown };
  const identity: Record<string, string> = {};
  if (body.identity && typeof body.identity === 'object' && !Array.isArray(body.identity)) {
    for (const [k, v] of Object.entries(body.identity as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) identity[k] = v.trim();
    }
  }

  const base = getAibackhubBaseUrl();
  if (!base) {
    return NextResponse.json({ error: 'El servicio de integraciones no está disponible en este momento.' }, { status: 503 });
  }
  try {
    const res = await fetch(`${base}/api/mcp/connections/${encodeURIComponent(connectionId)}/mysql-probe`, {
      method: 'POST',
      headers: { ...hubCreateHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
