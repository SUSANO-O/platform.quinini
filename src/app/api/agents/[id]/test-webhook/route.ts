/**
 * POST /api/agents/[id]/test-webhook
 * Envía un POST JSON de prueba a la URL configurada en la herramienta `webhook` del agente (Mongo).
 * No depende del LLM: sirve para comprobar conectividad y que el endpoint recibe datos.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { extractAgentWebhooks, type WebhookEntry } from '@/lib/agent-webhooks';

type Params = { params: Promise<{ id: string }> };

const TEST_TIMEOUT_MS = 12_000;

/** Devuelve el webhook a probar: si se pasa webhookId, busca por id; si no, el primero. */
function pickWebhook(entries: WebhookEntry[], webhookId?: string | null): WebhookEntry | null {
  if (entries.length === 0) return null;
  if (!webhookId) return entries[0];
  return entries.find((w) => w.id === webhookId) ?? null;
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

  let webhookId: string | null = null;
  try {
    const body = (await req.json()) as { webhookId?: string };
    if (typeof body?.webhookId === 'string' && body.webhookId.trim()) webhookId = body.webhookId.trim();
  } catch { /* sin body */ }

  const entries = extractAgentWebhooks(
    agent as { tools?: Array<{ toolId?: string; config?: unknown }> },
  );
  const hook = pickWebhook(entries, webhookId);
  if (!hook) {
    return NextResponse.json(
      { error: 'No hay webhooks configurados. Añade al menos uno y pulsa Guardar herramientas.' },
      { status: 400 },
    );
  }

  if (!isAllowedWebhookUrl(hook.url)) {
    return NextResponse.json({ error: 'URL inválida (solo http/https).' }, { status: 400 });
  }

  const payload = {
    event: 'webhook_test',
    webhookName: hook.name,
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
