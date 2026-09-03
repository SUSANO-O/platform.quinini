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
import { ClientAgent, WebhookDelivery, WebhookOutbox } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import {
  agentIdsForOwner,
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

  // NO se filtra por `tenantId`: ese campo es el tenant de AIBackHub
  // (`req.tenantId ?? 'default'`), no el dueño. La propiedad se resuelve por
  // los agentes del usuario — ver `agentIdsForOwner`.
  const misAgentes = await ClientAgent.find({ userId })
    .select({ _id: 1, agentHubId: 1 })
    .lean() as Array<{ _id?: unknown; agentHubId?: string }>;
  const idsPropios = agentIdsForOwner(misAgentes);

  if (idsPropios.length === 0) {
    return NextResponse.json({
      resumen: buildSummary([]),
      cola: { pendientes: 0, agotadas: 0 },
      entregas: [],
    });
  }

  // Si se pide un agente concreto, tiene que ser del usuario.
  const alcance = agentId
    ? idsPropios.includes(agentId)
      ? [agentId]
      : []
    : idsPropios;
  if (alcance.length === 0) {
    return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });
  }

  const filter: Record<string, unknown> = { agentId: { $in: alcance } };
  const listFilter = soloFallidas ? { ...filter, ok: false } : filter;

  const [rows, ventana, pendientes, fallidasEnCola] = await Promise.all([
    WebhookDelivery.find(listFilter).sort({ createdAt: -1 }).limit(limit).lean(),
    WebhookDelivery.find(filter).sort({ createdAt: -1 }).limit(SUMMARY_WINDOW).lean(),
    WebhookOutbox.countDocuments({ agentId: { $in: alcance }, status: 'pending' }),
    WebhookOutbox.countDocuments({ agentId: { $in: alcance }, status: 'failed' }),
  ]);

  return NextResponse.json({
    resumen: buildSummary(ventana as DeliveryRow[]),
    cola: { pendientes, agotadas: fallidasEnCola },
    entregas: (rows as DeliveryRow[]).map(toDeliveryItem),
  });
}
