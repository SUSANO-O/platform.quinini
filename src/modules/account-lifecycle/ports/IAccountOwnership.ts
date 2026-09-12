import type { OwnedIds } from '../domain/purge-scope';

export type AccountOwnership = OwnedIds & {
  /** Ids de los agentes del lado del hub (RAG, credenciales MCP). */
  agentHubIds: string[];
};

/** Resuelve qué es de una cuenta, ANTES de borrar nada. */
export interface IAccountOwnership {
  resolve(accountId: string): Promise<AccountOwnership>;
}
