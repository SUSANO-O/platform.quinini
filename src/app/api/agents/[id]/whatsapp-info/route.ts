/**
 * GET /api/agents/[id]/whatsapp-info
 *
 * Devuelve la info que el cliente necesita para configurar el webhook en Meta:
 *   - webhook URL (que pega en Meta)
 *   - verify token (que pega en Meta)
 *   - estado actual (disconnected | pending | connected | error)
 *   - phoneNumberId, displayPhone (lectura)
 *
 * NO devuelve nunca el access token ni el app secret (write-only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { getWhatsAppWebhookUrl, generateVerifyToken } from '@/lib/whatsapp';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const agent = await ClientAgent.findOne({ _id: id, userId });
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  // Auto-generar verify token si no existe (para que el cliente pueda copiarlo)
  let verifyToken = String(agent.get('whatsapp.verifyToken') || '');
  if (!verifyToken) {
    verifyToken = generateVerifyToken();
    agent.set('whatsapp.verifyToken', verifyToken);
    agent.markModified('whatsapp');
    await agent.save();
  }

  const wa = agent.get('whatsapp') || {};
  return NextResponse.json({
    webhookUrl:    getWhatsAppWebhookUrl(),
    verifyToken,
    phoneNumberId: String(wa.phoneNumberId || ''),
    displayPhone:  String(wa.displayPhone || ''),
    wabaId:        String(wa.wabaId || ''),
    apiVersion:    String(wa.apiVersion || 'v21.0'),
    enabled:       Boolean(wa.enabled),
    status:        String(wa.status || 'disconnected'),
    hasAccessToken: Boolean(wa.accessTokenEnc),
    hasAppSecret:   Boolean(wa.appSecretEnc),
    connectedAt:    wa.connectedAt || null,
    lastError:      String(wa.lastError || ''),
  });
}
