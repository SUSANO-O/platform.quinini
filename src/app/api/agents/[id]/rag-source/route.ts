/**
 * DELETE /api/agents/[id]/rag-source?fileId=xxx
 * Removes a single RAG source (file or manual) from an agent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { canAttemptHubSync, syncHubCatalogFromLandingAgentDoc } from '@/lib/aibackhub-sync';
import { deleteRagSourceEmbeddings } from '@/lib/rag-embeddings-index';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const { id } = await params;
  const fileId = req.nextUrl.searchParams.get('fileId');
  // Also support deleting by array index for manual text/url sources
  const indexStr = req.nextUrl.searchParams.get('index');

  if (!fileId && indexStr === null) {
    return NextResponse.json({ error: 'fileId o index requerido.' }, { status: 400 });
  }

  await connectDB();

  const agent = await ClientAgent.findOne({ _id: id, userId });
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  if (agent.isPlatform) {
    return NextResponse.json(
      {
        error:
          'Los agentes de plataforma no se pueden modificar desde la landing. Edita el conocimiento en AgentFlowHub.',
      },
      { status: 403 },
    );
  }

  /** Los vectores se borran por nombre de archivo, así que hay que leerlo antes. */
  const eliminados: string[] = [];

  if (fileId) {
    agent.ragSources = (agent.ragSources ?? []).filter((s: { fileId?: string | null; name?: string }) => {
      if (s.fileId !== fileId) return true;
      if (typeof s.name === 'string' && s.name.trim()) eliminados.push(s.name);
      return false;
    });
  } else {
    const idx = parseInt(indexStr!);
    if (isNaN(idx) || idx < 0 || idx >= (agent.ragSources?.length ?? 0)) {
      return NextResponse.json({ error: 'Índice inválido.' }, { status: 400 });
    }
    const fuera = (agent.ragSources ?? [])[idx] as { name?: string } | undefined;
    if (typeof fuera?.name === 'string' && fuera.name.trim()) eliminados.push(fuera.name);
    agent.ragSources = (agent.ragSources ?? []).filter((_: unknown, i: number) => i !== idx);
  }

  await agent.save();

  const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
  if (hubId && canAttemptHubSync()) {
    const ok = await syncHubCatalogFromLandingAgentDoc(agent);
    agent.syncStatus = ok ? 'synced' : 'failed';
    await agent.save();
  }

  /** Sin esto el documento desaparece del panel pero el agente lo sigue citando. */
  for (const nombre of eliminados) {
    await deleteRagSourceEmbeddings({ agentHubId: hubId, fileName: nombre });
  }

  return NextResponse.json({ ok: true, remaining: agent.ragSources?.length ?? 0 });
}
