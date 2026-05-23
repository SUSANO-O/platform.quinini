import { connectDB } from '@/lib/db/connection';
import { AbTest, ClientAgent, RagBulkJob, Widget } from '@/lib/db/models';
import { canAttemptHubSync, hubCreateHeaders, hubFetch } from '@/lib/aibackhub-sync';

export type DeleteClientAgentResult =
  | { ok: true; widgetsRemoved: number; subAgentsRemoved: number }
  | { ok: false; error: string; status: number };

async function deleteHubAgent(agentHubId: string): Promise<void> {
  if (!canAttemptHubSync()) return;
  const hid = agentHubId.trim();
  if (!hid) return;
  try {
    await hubFetch(`/api/agents/${encodeURIComponent(hid)}`, {
      method: 'DELETE',
      headers: hubCreateHeaders(),
    });
  } catch {
    /* best-effort */
  }
}

export async function deleteClientAgent(userId: string, agentId: string): Promise<DeleteClientAgentResult> {
  await connectDB();

  const agent = await ClientAgent.findOne({ _id: agentId, userId });
  if (!agent) return { ok: false, error: 'Agente no encontrado.', status: 404 };

  if (agent.isPlatform) {
    return {
      ok: false,
      error: 'Los agentes de plataforma no se pueden eliminar desde la landing.',
      status: 403,
    };
  }

  const agentIdStr = agent._id.toString();

  const subDelete = await ClientAgent.deleteMany({
    userId,
    $or: [{ parentAgentId: agentIdStr }, { _id: { $in: agent.subAgentIds ?? [] } }],
  });

  if (agent.parentAgentId) {
    await ClientAgent.updateMany({ userId }, { $pull: { subAgentIds: agentIdStr } });
  }

  const widgetDelete = await Widget.deleteMany({
    userId,
    $or: [{ agentId: agentIdStr }, { agentIds: agentIdStr }],
  });

  await AbTest.deleteMany({ userId, agentId: agentIdStr });
  await RagBulkJob.deleteMany({ userId, agentId: agentIdStr });

  const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
  if (hubId) await deleteHubAgent(hubId);

  await ClientAgent.deleteOne({ _id: agent._id });

  return {
    ok: true,
    widgetsRemoved: widgetDelete.deletedCount ?? 0,
    subAgentsRemoved: subDelete.deletedCount ?? 0,
  };
}
