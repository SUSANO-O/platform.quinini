import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Widget } from '@/lib/db/models';
import { isOwnId } from '../domain/purge-scope';
import type { AccountOwnership, IAccountOwnership } from '../ports/IAccountOwnership';

/**
 * Resuelve qué agentes y widgets son de la cuenta. Se hace UNA vez, antes de
 * borrar nada, y el resultado queda guardado en la constancia: si el proceso se
 * corta, se puede retomar con los mismos ids.
 */
export const mongoAccountOwnership: IAccountOwnership = {
  async resolve(accountId: string): Promise<AccountOwnership> {
    await connectDB();
    const [agents, widgets] = await Promise.all([
      ClientAgent.find({ userId: accountId }).select({ _id: 1, agentHubId: 1 }).lean() as Promise<Array<{ _id: unknown; agentHubId?: string }>>,
      Widget.find({ userId: accountId }).select({ _id: 1 }).lean() as Promise<Array<{ _id: unknown }>>,
    ]);

    return {
      accountId,
      agentIds: agents.map((a) => String(a._id)).filter(isOwnId),
      widgetIds: widgets.map((w) => String(w._id)).filter(isOwnId),
      agentHubIds: agents.map((a) => (a.agentHubId || '').trim()).filter(Boolean),
    };
  },
};
