import { canAttemptHubSync, hubCreateHeaders, hubFetch } from '@/lib/aibackhub-sync';
import type { AccountOwnership } from '../ports/IAccountOwnership';
import type { IAccountPurger, PurgeCounts } from '../ports/IAccountPurger';

/**
 * Limpia lo que la cuenta dejó en el hub (matias-backend): vectores del RAG,
 * conexiones MCP y el agente.
 *
 * Importa el ORDEN: el borrado de vectores valida que el agente exista en el
 * tenant, así que el documento del agente va último. Y este purgador corre
 * ANTES que el de la landing, que es donde viven los `agentHubId`.
 *
 * Ojo: el DELETE de agente del hub NO arrastra vectores ni credenciales — por
 * eso se borran acá explícitamente. Sin esto quedarían tokens de Slack/HubSpot
 * de un cliente ya eliminado.
 */
async function hubJson<T = unknown>(path: string, init: RequestInit): Promise<T | null> {
  const res = await hubFetch(path, { ...init, headers: hubCreateHeaders() });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`hub ${init.method ?? 'GET'} ${path} → ${res.status}`);
  }
  return (await res.json().catch(() => null)) as T | null;
}

type ConnectionsResponse = { data?: { connections?: Array<{ id?: string }> } };
type VectorDeleteResponse = { data?: { deleted?: number } };

async function listConnectionIds(agentHubId: string): Promise<string[]> {
  const body = await hubJson<ConnectionsResponse>(
    `/api/mcp/connections?agentId=${encodeURIComponent(agentHubId)}`, { method: 'GET' },
  );
  return (body?.data?.connections ?? []).map((c) => String(c?.id ?? '')).filter(Boolean);
}

export const hubAccountPurger: IAccountPurger = {
  store: 'hub',

  async count(owned: AccountOwnership): Promise<PurgeCounts> {
    if (!canAttemptHubSync() || !owned.agentHubIds.length) return {};
    const counts: PurgeCounts = { agentes: owned.agentHubIds.length };
    let conexiones = 0;
    for (const hubId of owned.agentHubIds) {
      try { conexiones += (await listConnectionIds(hubId)).length; } catch { /* el simulacro no debe romper */ }
    }
    if (conexiones) counts.conexionesMcp = conexiones;
    return counts;
  },

  async purge(owned: AccountOwnership): Promise<PurgeCounts> {
    if (!canAttemptHubSync() || !owned.agentHubIds.length) return {};
    const counts: PurgeCounts = { agentes: 0, conexionesMcp: 0, vectores: 0 };

    for (const hubId of owned.agentHubIds) {
      for (const connectionId of await listConnectionIds(hubId)) {
        await hubJson(`/api/mcp/connections/${encodeURIComponent(connectionId)}`, { method: 'DELETE' });
        counts.conexionesMcp += 1;
      }

      const vectors = await hubJson<VectorDeleteResponse>(
        `/api/embeddings/agent/${encodeURIComponent(hubId)}`, { method: 'DELETE' },
      );
      counts.vectores += Number(vectors?.data?.deleted ?? 0);

      await hubJson(`/api/agents/${encodeURIComponent(hubId)}`, { method: 'DELETE' });
      counts.agentes += 1;
    }

    return counts;
  },
};
