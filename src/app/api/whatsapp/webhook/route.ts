/**
 * WhatsApp Business Cloud API webhook (Fase 2).
 *
 * - GET  /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y
 *        Verificación que hace Meta al suscribir el webhook. Buscamos el verify_token
 *        en algún agente. Si match, devolvemos el challenge.
 *
 * - POST /api/whatsapp/webhook
 *        Recibe mensajes entrantes. Identifica el agente por phone_number_id,
 *        valida la firma X-Hub-Signature-256, procesa el mensaje a través del
 *        chat del agente (MCP), y envía la respuesta de vuelta por WhatsApp.
 */

import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import {
  sendWhatsAppText,
  verifyWebhookSignature,
  getWhatsAppAppSecret,
  type WhatsAppAgentConfig,
} from '@/lib/whatsapp';
import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';
import { persistWidgetTranscript } from '@/lib/widget-transcript';

export const dynamic = 'force-dynamic';

// ── GET: verificación inicial de Meta ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token') || '';
  const challenge = url.searchParams.get('hub.challenge') || '';

  if (mode !== 'subscribe' || !token) {
    return new Response('Bad request', { status: 400 });
  }

  try {
    await connectDB();
    const agent = await ClientAgent.findOne({
      'whatsapp.verifyToken': token,
    }).select({ 'whatsapp.verifyToken': 1, _id: 1 }).lean() as { _id: unknown } | null;

    if (!agent) {
      console.warn('[whatsapp/webhook] verify token desconocido', { token: token.slice(0, 12) + '...' });
      return new Response('Forbidden', { status: 403 });
    }

    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (e) {
    console.error('[whatsapp/webhook] verify error:', e);
    return new Response('Server error', { status: 500 });
  }
}

// ── POST: mensajes entrantes ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // SIEMPRE responder 200 a Meta lo antes posible para que no reintente.
  // Procesamos en background. Si fallamos, Meta no debe reenviar.
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('x-hub-signature-256');

  // Procesamiento en background — no bloqueamos la respuesta a Meta
  void processIncomingMessages(rawBody, signatureHeader).catch((e) => {
    console.error('[whatsapp/webhook] processing failed:', e);
  });

  return new Response('OK', { status: 200 });
}

interface IncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface ChangeValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  messages?: IncomingMessage[];
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
}

async function processIncomingMessages(rawBody: string, signatureHeader: string | null): Promise<void> {
  let body: { entry?: Array<{ changes?: Array<{ value?: ChangeValue }> }> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return;
  }

  if (!Array.isArray(body.entry)) return;

  await connectDB();

  for (const entry of body.entry) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id?.trim();
      const messages = value.messages || [];
      if (!phoneNumberId || messages.length === 0) continue;

      // Buscar agente que reciba en este número
      const agentDoc = await ClientAgent.findOne({
        'whatsapp.phoneNumberId': phoneNumberId,
        'whatsapp.enabled': true,
      }).lean() as {
        _id: unknown;
        userId: string;
        agentHubId?: string;
        whatsapp?: WhatsAppAgentConfig;
      } | null;

      if (!agentDoc) {
        console.warn('[whatsapp/webhook] no agent for phone_number_id', { phoneNumberId });
        continue;
      }

      // Validar firma si hay app secret configurado
      const appSecret = getWhatsAppAppSecret(agentDoc.whatsapp);
      if (appSecret && !verifyWebhookSignature(appSecret, rawBody, signatureHeader)) {
        console.warn('[whatsapp/webhook] firma inválida', { phoneNumberId });
        continue;
      }

      const agentIdForChat = agentDoc.agentHubId?.trim() || String(agentDoc._id);
      const ownerUserId = String(agentDoc.userId);

      for (const msg of messages) {
        if (msg.type !== 'text' || !msg.text?.body?.trim()) continue;
        const from = msg.from.trim();
        const text = msg.text.body.trim();
        const sessionId = `wa:${phoneNumberId}:${from}`;

        await handleSingleMessage({
          agentIdForChat,
          ownerUserId,
          widgetIdEquivalent: String(agentDoc._id),
          waConfig: agentDoc.whatsapp || {},
          from,
          text,
          sessionId,
        });
      }
    }
  }
}

async function handleSingleMessage(params: {
  agentIdForChat: string;
  ownerUserId: string;
  widgetIdEquivalent: string;
  waConfig: WhatsAppAgentConfig;
  from: string;
  text: string;
  sessionId: string;
}): Promise<void> {
  // Llamar al chat MCP directamente (mismo path que el widget)
  const chatBody = JSON.stringify({
    message: params.text,
    agentId: params.agentIdForChat,
    sessionId: params.sessionId,
    visitorId: `wa_${params.from}`,
  });

  let replyText = '';
  let toolsUsed: string[] | undefined;
  try {
    const direct = await tryServeWidgetChatViaHubMcp({
      widgetTokenStartsWithWt: true, // bypass — llamada server-side
      parsedAgentId: params.agentIdForChat,
      rawBody: chatBody,
      ownerUserId: params.ownerUserId,
    });
    if (direct?.reply) {
      replyText = direct.reply;
      toolsUsed = direct.toolsUsed;
    }
  } catch (e) {
    console.error('[whatsapp/webhook] MCP chat failed:', e);
  }

  if (!replyText) {
    replyText = 'Disculpa, no pude procesar tu mensaje en este momento. Te responderemos en breve.';
  }

  // Enviar respuesta por WhatsApp
  const sendResult = await sendWhatsAppText(params.waConfig, params.from, replyText);
  if (!sendResult.ok) {
    console.error('[whatsapp/webhook] send failed:', sendResult.error);
  }

  // Persistir en historial para inbox + dashboard counters
  void persistWidgetTranscript({
    widgetId: params.widgetIdEquivalent,
    userId: params.ownerUserId,
    agentId: params.agentIdForChat,
    sessionId: params.sessionId,
    userMessage: params.text,
    assistantMessage: replyText,
    toolsUsed,
  }).catch(() => { /* persistencia best-effort */ });
}
