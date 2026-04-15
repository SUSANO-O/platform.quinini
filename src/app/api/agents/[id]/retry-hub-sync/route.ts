/**
 * POST /api/agents/[id]/retry-hub-sync
 * Reintenta sync landing → catálogo AIBackHub: PUT si ya hay agentHubId, si no POST de alta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import {
  canAttemptHubSync,
  postCreateLandingAgentOnHubCatalog,
  syncHubCatalogFromLandingAgentDoc,
} from '@/lib/aibackhub-sync';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const token = _req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const agent = await ClientAgent.findOne({ _id: id, userId });
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  if (agent.isPlatform) {
    return NextResponse.json(
      { error: 'Los agentes de plataforma se sincronizan desde AgentFlowHub.' },
      { status: 403 },
    );
  }

  if (!canAttemptHubSync()) {
    return NextResponse.json(
      { error: 'BACKEND_URL no configurada; no se puede contactar AIBackHub.' },
      { status: 503 },
    );
  }

  const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
  if (hubId) {
    const ok = await syncHubCatalogFromLandingAgentDoc(agent);
    agent.syncStatus = ok ? 'synced' : 'failed';
    await agent.save();
    return NextResponse.json({
      hubSync: ok,
      syncStatus: agent.syncStatus,
      agentHubId: hubId,
      mode: 'put' as const,
      ...(ok ? {} : { error: 'No se pudo actualizar el catálogo en el hub (revisa API key y que el agente exista).' }),
    });
  }

  const { success, hubId: newHubId } = await postCreateLandingAgentOnHubCatalog(agent);
  if (success) {
    agent.syncStatus = 'synced';
    if (newHubId) agent.agentHubId = newHubId;
    await agent.save();
    const savedHubId =
      typeof newHubId === 'string' && newHubId.trim()
        ? newHubId.trim()
        : String(agent.agentHubId ?? '').trim();
    return NextResponse.json({
      hubSync: true,
      syncStatus: 'synced',
      agentHubId: savedHubId,
      mode: 'post' as const,
    });
  }

  agent.syncStatus = 'failed';
  await agent.save();
  return NextResponse.json({
    hubSync: false,
    syncStatus: 'failed',
    mode: 'post' as const,
    error: 'AIBackHub rechazó la creación del agente (¿duplicado en catálogo o datos inválidos?).',
  });
}
