/**
 * POST /api/agents/[id]/playground — probar el agente desde su editor (panel "Probar").
 * Body: { message, history?, sessionId?, identity? } → { reply, toolsUsed, navOffer? }
 *
 * Mismo camino que el chat del widget (tryServeWidgetChatViaHubMcp), restringido al DUEÑO del
 * agente. `identity` (claims, p. ej. { cliente: "1013…" }) permite probar como un cliente concreto
 * los datos de la propia base del dueño (MCP MySQL); solo se acepta en esta ruta autenticada.
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';
import { finalizeWidgetNavReply } from '@/lib/widget-page-nav';
import { STRICT_PURPOSE_SUFFIX } from '@/lib/widget-strict-purpose';
import { sanitizePlaygroundHistory, sanitizePlaygroundIdentity } from '@/lib/agent-playground';

type Params = { params: Promise<{ id: string }> };
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const token = req.cookies.get('afhub_session')?.value;
  const userId = token ? verifySessionToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const rl = await checkRateLimitAsync('agent-playground', userId, 30, 60_000);
  if (!rl.success) return NextResponse.json({ error: 'Demasiados mensajes de prueba; espera un minuto.' }, { status: 429 });

  let body: { message?: unknown; history?: unknown; sessionId?: unknown; identity?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  if (!message) return NextResponse.json({ error: 'Escribe un mensaje.' }, { status: 400 });

  await connectDB();
  const owned = await ClientAgent.exists({ _id: id, userId });
  if (!owned) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const sessionId =
    typeof body.sessionId === 'string' && /^pg_[A-Za-z0-9_-]{6,60}$/.test(body.sessionId) ? body.sessionId : `pg_${userId.slice(-8)}_${Date.now()}`;
  const verifiedIdentity = sanitizePlaygroundIdentity(body.identity);

  const result = await tryServeWidgetChatViaHubMcp({
    widgetTokenStartsWithWt: true,
    parsedAgentId: id,
    rawBody: JSON.stringify({ agentId: id, message, history: sanitizePlaygroundHistory(body.history), sessionId }),
    ownerUserId: userId,
    strictPurposeSuffix: STRICT_PURPOSE_SUFFIX,
    ...(verifiedIdentity ? { verifiedIdentity, identityStatus: 'playground' } : {}),
    clientOrigin: 'panel:playground',
  });
  if (!result) {
    return NextResponse.json({ error: 'El agente no respondió. Revisa que esté activo y sincronizado con el hub.' }, { status: 502 });
  }
  const { reply, navOffer } = finalizeWidgetNavReply(result.reply);
  return NextResponse.json({ reply, toolsUsed: result.toolsUsed ?? [], sessionId, ...(navOffer ? { navOffer } : {}) });
}
