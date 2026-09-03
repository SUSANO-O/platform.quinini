/**
 * GET /api/webhooks/deliveries — bitácora de entregas de webhook del usuario.
 *
 * Responde la pregunta que antes no tenía respuesta: "¿mis leads están
 * llegando?". Cada fila es un INTENTO (matias-backend hace hasta 3 inline).
 *
 * Query params:
 *   status=todas|fallidas   (default: todas)
 *   agentId=<id>            (opcional)
 *   limit=1..200            (default 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { WebhookDelivery, WebhookOutbox } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import {
  buildSummary,
  toDeliveryItem,
  type DeliveryRow,
} from '@/lib/webhook-deliveries-view';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Se resume sobre esta ventana: suficiente para ver tendencia sin traer todo. */
const SUMMARY_WINDOW = 500;

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const soloFallidas = sp.get('status') === 'fallidas';
  const agentId = (sp.get('agentId') ?? '').trim();
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '50', 10) || 50));

  await connectDB();

  // El filtro por tenantId es lo que impide ver entregas de otro cliente.
  const filter: Record<string, unknown> = { tenantId: userId };
  if (agentId) filter.agentId = agentId;
  const listFilter = soloFallidas ? { ...filter, ok: false } : filter;

  const [rows, ventana, pendientes, fallidasEnCola] = await Promise.all([
    WebhookDelivery.find(listFilter).sort({ createdAt: -1 }).limit(limit).lean(),
    WebhookDelivery.find(filter).sort({ createdAt: -1 }).limit(SUMMARY_WINDOW).lean(),
    WebhookOutbox.countDocuments({ tenantId: userId, status: 'pending' }),
    WebhookOutbox.countDocuments({ tenantId: userId, status: 'failed' }),
  ]);

  return NextResponse.json({
    resumen: buildSummary(ventana as DeliveryRow[]),
    cola: { pendientes, agotadas: fallidasEnCola },
    entregas: (rows as DeliveryRow[]).map(toDeliveryItem),
  });
}
