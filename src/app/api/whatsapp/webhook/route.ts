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

import { NextRequest, after } from 'next/server';
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
import { getAgentflowhubBaseUrl } from '@/lib/aibackhub-sync';
import { ConversationSession, WidgetMessage, User } from '@/lib/db/models';
import { normalizePhoneDigits } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  // after() garantiza que el procesamiento corre DESPUÉS de enviar el 200 a Meta.
  // Con void, Vercel mataba la función antes de terminar las llamadas HTTP.
  after(async () => {
    await processIncomingMessages(rawBody, signatureHeader).catch((e) => {
      console.error('[whatsapp/webhook] processing failed:', e);
    });
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

      // ── Detectar si el mensaje viene del dueño respondiendo una alerta de handoff ──
      const handledByOwner = new Set<string>();
      for (const msg of messages) {
        if (msg.type !== 'text' || !msg.text?.body?.trim()) continue;
        const senderDigits = normalizePhoneDigits(msg.from || '');

        // Buscar widget cuyo humanSupportPhone coincida con el remitente
        const { Widget } = await import('@/lib/db/models');
        const ownerWidget = await Widget.findOne({
          humanSupportPhone: { $exists: true, $ne: '' },
        }).select({ userId: 1, humanSupportPhone: 1 }).lean() as
          | { userId?: unknown; humanSupportPhone?: string } | null;

        const ownerUser = ownerWidget
          ? await User.findById(ownerWidget.userId).select({ _id: 1, escalationWhatsAppPhone: 1 }).lean() as
              | { _id: unknown; escalationWhatsAppPhone?: string } | null
          : await User.findOne({
              escalationWhatsAppPhone: { $exists: true, $ne: null },
            }).select({ _id: 1, escalationWhatsAppPhone: 1 }).lean() as
              | { _id: unknown; escalationWhatsAppPhone?: string } | null;

        const ownerPhone = ownerWidget?.humanSupportPhone || (ownerUser as { escalationWhatsAppPhone?: string } | null)?.escalationWhatsAppPhone || '';

        if (!ownerUser || normalizePhoneDigits(ownerPhone) !== senderDigits) continue;

        // Es el dueño — marcar como manejado para no procesarlo como cliente
        handledByOwner.add(msg.id);

        // Comando /bot: reactiva el agente IA (desactiva humanMode)
        if (msg.text!.body.trim().toLowerCase() === '/bot') {
          const lastSession = await ConversationSession.findOne({
            userId: String(ownerUser._id),
            escalated: true,
            inboxStatus: { $ne: 'resolved' },
          }).sort({ handoffAt: -1 }).select({ sessionId: 1 }).lean() as { sessionId: string } | null;

          if (lastSession) {
            await ConversationSession.updateOne(
              { sessionId: lastSession.sessionId },
              { $set: { humanMode: false } },
            );
          }
          // Confirmar al dueño por WhatsApp
          const { ClientAgent } = await import('@/lib/db/models');
          const waAgent = await ClientAgent.findOne({
            userId: String(ownerUser._id),
            'whatsapp.enabled': true,
          }).select({ whatsapp: 1 }).lean() as { whatsapp?: WhatsAppAgentConfig } | null;
          if (waAgent?.whatsapp) {
            await sendWhatsAppText(
              waAgent.whatsapp,
              normalizePhoneDigits(ownerPhone),
              lastSession
                ? '✅ Bot reactivado — el agente IA retoma la conversación.'
                : '⚠️ No hay sesión activa abierta para reactivar.',
            );
          }
          continue;
        }

        type WaSession = { sessionId: string; chatSessionId?: string | null; widgetId?: string; userId?: string };
        const contextId = (msg as unknown as { context?: { id?: string } }).context?.id;
        let session: WaSession | null = null;

        if (contextId) {
          session = await ConversationSession.findOne({ handoffWaNotifMsgId: contextId })
            .select({ sessionId: 1, chatSessionId: 1, widgetId: 1, userId: 1 }).lean() as WaSession | null;
        }
        if (!session) {
          session = await ConversationSession.findOne({
            userId: String(ownerUser._id),
            escalated: true,
            inboxStatus: { $ne: 'resolved' },
          }).sort({ handoffAt: -1 }).select({ sessionId: 1, chatSessionId: 1, widgetId: 1, userId: 1 }).lean() as WaSession | null;
        }

        if (session) {
          const targetSessionId = session.chatSessionId || session.sessionId;
          await WidgetMessage.create({
            widgetId: session.widgetId || '',
            userId: String(ownerUser._id),
            agentId: '',
            sessionId: targetSessionId,
            role: 'assistant',
            sentBy: 'human',
            content: msg.text!.body.trim(),
            traceId: `wa-owner:${Date.now()}`,
          });
          await ConversationSession.updateOne(
            { sessionId: session.sessionId },
            { $set: { lastHumanMessageAt: new Date(), humanMode: true } },
          );
        }
      }

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
        if (handledByOwner.has(msg.id)) continue; // ya ruteado como respuesta del dueño
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
  // Verificar si hay un humano atendiendo (bot se calla pero el mensaje sí se guarda en inbox)
  const activeSession = await ConversationSession.findOne({ sessionId: params.sessionId })
    .select({ humanMode: 1 }).lean() as { humanMode?: boolean } | null;
  const isHumanMode = activeSession?.humanMode === true;

  if (isHumanMode) {
    // Humano atendiendo: guardar mensaje del cliente en inbox pero no responder con bot
    void WidgetMessage.create({
      widgetId: params.widgetIdEquivalent,
      userId: params.ownerUserId,
      agentId: params.agentIdForChat,
      sessionId: params.sessionId,
      role: 'user',
      content: params.text,
      traceId: `wa-in:${Date.now()}`,
    }).catch(() => {});
    void ConversationSession.updateOne(
      { sessionId: params.sessionId },
      { $set: { lastVisitorMessageAt: new Date() } },
    ).catch(() => {});
    console.log('[whatsapp/webhook] humanMode — mensaje guardado, bot silenciado para', params.sessionId);
    return;
  }

  const chatBody = JSON.stringify({
    message: params.text,
    agentId: params.agentIdForChat,
    sessionId: params.sessionId,
    visitorId: `wa_${params.from}`,
  });

  let replyText = '';
  let toolsUsed: string[] | undefined;

  // Camino 1: MCP directo (agentes con webhook tool o HubSpot auto-capture configurados)
  try {
    const direct = await tryServeWidgetChatViaHubMcp({
      widgetTokenStartsWithWt: true,
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

  // Camino 2: AgentFlowhub widget chat (agentes de conversación regulares sin webhook tool)
  if (!replyText) {
    try {
      const hubBase = getAgentflowhubBaseUrl();
      const hubUrl = `${hubBase.replace(/\/$/, '')}/api/widget/chat`;
      const hubRes = await fetch(hubUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: chatBody,
        signal: AbortSignal.timeout(60_000),
      });
      if (hubRes.ok) {
        const hubData = await hubRes.json() as {
          reply?: string; response?: string; text?: string; toolsUsed?: string[];
        };
        replyText = hubData.reply || hubData.response || hubData.text || '';
        if (Array.isArray(hubData.toolsUsed) && hubData.toolsUsed.length) {
          toolsUsed = hubData.toolsUsed;
        }
      } else {
        console.warn('[whatsapp/webhook] hub fallback HTTP', hubRes.status);
      }
    } catch (e) {
      console.error('[whatsapp/webhook] hub fallback error:', e);
    }
  }

  if (!replyText) {
    replyText = 'Disculpa, no pude procesar tu mensaje en este momento. Te responderemos en breve.';
  }

  // Enviar respuesta por WhatsApp
  const sendResult = await sendWhatsAppText(params.waConfig, params.from, replyText);
  if (!sendResult.ok) {
    console.error('[whatsapp/webhook] send failed:', sendResult.error);
  }

  // Upsert ConversationSession para que la conversación aparezca en el Inbox del dashboard.
  // escalated: true + handoffAt hace que inboxSessionFilter la incluya sin cambios.
  const now = new Date();
  void ConversationSession.findOneAndUpdate(
    { sessionId: params.sessionId },
    {
      $setOnInsert: {
        sessionId: params.sessionId,
        chatSessionId: params.sessionId,
        userId: params.ownerUserId,
        widgetId: params.widgetIdEquivalent,
        agentId: params.agentIdForChat,
        visitorId: `wa_${params.from}`,
        escalated: true,
        inboxStatus: 'open',
        startedAt: now,
        handoffAt: now,
        handoffContact: { phone: params.from },
        handoffMessage: params.text,
      },
      $set: { updatedAt: now },
    },
    { upsert: true },
  ).catch(() => { /* best-effort */ });

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
