/**
 * POST /api/agents/[id]/test-webhook
 * Envía un POST JSON de prueba a la URL configurada en la herramienta `webhook` del agente (Mongo).
 * No depende del LLM: sirve para comprobar conectividad y que el endpoint recibe datos.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

const TEST_TIMEOUT_MS = 12_000;

function getWebhookFromTools(
  tools: { toolId: string; config?: Record<string, unknown> }[] | undefined,
): { url: string; secret: string } | null {
  if (!Array.isArray(tools)) return null;
  const row = tools.find((t) => t?.toolId === 'webhook');
  if (!row?.config || typeof row.config !== 'object') return null;
  const url = typeof row.config.url === 'string' ? row.config.url.trim() : '';
  if (!url) return null;
  const secret = typeof row.config.secret === 'string' ? row.config.secret.trim() : '';
  return { url, secret };
}

function isAllowedWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const agent = await ClientAgent.findOne({ _id: id, userId }).lean();
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  if ((agent as { isPlatform?: boolean }).isPlatform) {
    return NextResponse.json(
      { error: 'Los agentes de plataforma no se prueban desde aquí.' },
      { status: 403 },
    );
  }

  const rawTools = (agent as { tools?: { toolId: string; config?: Record<string, unknown> }[] }).tools;
  const hook = getWebhookFromTools(rawTools);
  if (!hook) {
    return NextResponse.json(
      { error: 'No hay URL de webhook guardada. Activa Webhook, pega la URL y pulsa Guardar herramientas.' },
      { status: 400 },
    );
  }

  if (!isAllowedWebhookUrl(hook.url)) {
    return NextResponse.json({ error: 'URL inválida (solo http/https).' }, { status: 400 });
  }

  const payload = {
    event: 'webhook_test',
    timestamp: new Date().toISOString(),
    source: 'matias_landing_test',
    message: 'Prueba manual desde el panel del agente (datos ficticios).',
    lead: {
      name: 'Usuario de prueba',
      email: 'prueba@ejemplo.com',
      phone: '+1-555-0100',
      company: 'Empresa de prueba',
      interest: 'Verificación de webhook',
    },
    conversation: {
      intent: 'other',
      priority: 'low',
      needs_human: false,
    },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'MatIAsLanding-WebhookTest/1.0',
  };
  if (hook.secret) {
    if (/^Bearer\s+/i.test(hook.secret)) {
      headers.Authorization = hook.secret;
    } else {
      headers.Authorization = `Bearer ${hook.secret}`;
    }
  }

  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });

    const text = await res.text();
    const snippet = text.slice(0, 500);

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      responseSnippet: snippet,
      sent: payload,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: 'No se pudo contactar la URL del webhook.',
        details: msg,
        sent: payload,
      },
      { status: 502 },
    );
  }
}
