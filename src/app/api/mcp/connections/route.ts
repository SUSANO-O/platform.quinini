/**
 * POST /api/mcp/connections
 * Crea una conexión MCP para el agente del hub ligado al agente de la landing (credenciales por agente).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';
import {
  getSessionUserId,
  getWritableLandingAgent,
  resolveHubAgentIdForMcp,
} from '@/lib/mcp-landing-auth';

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    landingAgentId?: string;
    integrationKey?: string;
    label?: string;
    credentials?: Record<string, string>;
  };

  const landingAgentId = String(body.landingAgentId ?? '').trim();
  const integrationKey = String(body.integrationKey ?? '').trim();
  const label = String(body.label ?? '').trim();
  const credentials = body.credentials;

  if (!landingAgentId || !integrationKey || !credentials || typeof credentials !== 'object') {
    return NextResponse.json(
      { error: 'Se requiere landingAgentId, integrationKey y credentials.' },
      { status: 400 },
    );
  }

  const agent = await getWritableLandingAgent(landingAgentId, userId);
  if (!agent) {
    return NextResponse.json(
      { error: 'Agente no encontrado o no editable desde la landing (p. ej. agente de plataforma).' },
      { status: 404 },
    );
  }

  const hubAgentId = await resolveHubAgentIdForMcp(landingAgentId);
  if (!hubAgentId) {
    return NextResponse.json(
      {
        error:
          'No se pudo resolver el agente en AIBackHub. Revisa BACKEND_URL y que el agente esté sincronizado (agentHubId).',
      },
      { status: 422 },
    );
  }

  const base = getAibackhubBaseUrl();
  if (!base) {
    return NextResponse.json({ error: 'BACKEND_URL no configurada.' }, { status: 503 });
  }

  try {
    const res = await fetch(`${base}/api/mcp/connections`, {
      method: 'POST',
      headers: hubCreateHeaders(),
      body: JSON.stringify({
        agentId: hubAgentId,
        integrationKey,
        ...(label ? { label } : {}),
        credentials,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
