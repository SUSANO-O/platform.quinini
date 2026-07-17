/**
 * GET  /api/admin/landing-assist — estado de Math + Math-ais bajo admin
 * POST /api/admin/landing-assist — crear/asegurar agentes + widgets en perfil admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import {
  ensureLandingAssistAgents,
  getLandingAssistStatus,
} from '@/lib/ensure-landing-assist-agents';
import { ensureHubPlatformAgentsInLanding } from '@/lib/hub-platform-import';

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  try {
    const status = await getLandingAssistStatus(adminId);
    return NextResponse.json({ ok: true, ...status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al leer estado.' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  let syncHub = true;
  try {
    const body = (await req.json().catch(() => ({}))) as { syncHub?: boolean };
    if (body.syncHub === false) syncHub = false;
  } catch {
    /* noop */
  }

  try {
    await ensureHubPlatformAgentsInLanding({ fallbackOwnerUserId: adminId }).catch(() => {});
    const result = await ensureLandingAssistAgents({ adminUserId: adminId, syncHub });
    return NextResponse.json({
      ok: true,
      message:
        'Listo: Math (aterrizaje) y Math-ais (usuario) quedan en el perfil administrador con sus widgets.',
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudieron crear los agentes.' },
      { status: 500 },
    );
  }
}
