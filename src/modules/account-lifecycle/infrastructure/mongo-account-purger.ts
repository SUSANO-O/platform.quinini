import type { Model } from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import {
  AbTest, ClientAgent, ConversationDailyLog, ConversationFlow, ConversationPack, ConversationSession,
  FlowConversation, InferenceMetric, PlatformUsage, RagBulkJob, RequestLog, ScheduledTask, SheetSnapshot,
  SheetSyncUsage, Subscription, TaskExecution, User, WebhookDelivery, WebhookOutbox, Widget,
  WidgetChatLatency, WidgetFeedback, WidgetMessage, WidgetSessionContext, WidgetShare,
} from '@/lib/db/models';
import { PURGE_CHILDREN, PURGE_ROOTS, buildOwnershipFilter, type PurgeTarget } from '../domain/purge-scope';
import type { AccountOwnership } from '../ports/IAccountOwnership';
import type { IAccountPurger, PurgeCounts } from '../ports/IAccountPurger';

/** Traducción del nombre lógico del dominio al modelo real. */
const MODELS: Record<string, Model<unknown>> = {
  AbTest, ClientAgent, ConversationDailyLog, ConversationFlow, ConversationPack, ConversationSession,
  FlowConversation, InferenceMetric, PlatformUsage, RagBulkJob, RequestLog, ScheduledTask, SheetSnapshot,
  SheetSyncUsage, Subscription, TaskExecution, WebhookDelivery, WebhookOutbox, Widget, WidgetChatLatency,
  WidgetFeedback, WidgetMessage, WidgetSessionContext, WidgetShare,
} as unknown as Record<string, Model<unknown>>;

export function modelFor(name: string): Model<unknown> {
  const m = MODELS[name];
  if (!m) throw new Error(`Modelo no mapeado en el purgador: ${name}`);
  return m;
}

async function run(
  owned: AccountOwnership,
  action: (model: Model<unknown>, filter: Record<string, unknown>) => Promise<number>,
): Promise<PurgeCounts> {
  await connectDB();
  const counts: PurgeCounts = {};

  // Hijos primero: si esto se corta, agentes y widgets siguen existiendo y se
  // puede volver a resolver qué faltaba.
  const ordered: PurgeTarget[] = [...PURGE_CHILDREN, ...PURGE_ROOTS];
  for (const target of ordered) {
    const filter = buildOwnershipFilter(target, owned);
    if (!filter) continue;
    const n = await action(modelFor(target.model), filter);
    if (n > 0) counts[target.model] = n;
  }
  return counts;
}

/** Purga los datos de la cuenta en la base de la landing. */
export const mongoAccountPurger: IAccountPurger = {
  store: 'landing',

  async count(owned: AccountOwnership): Promise<PurgeCounts> {
    const counts = await run(owned, (model, filter) => model.countDocuments(filter).exec());
    const user = await User.countDocuments({ _id: owned.accountId });
    if (user > 0) counts.User = user;
    return counts;
  },

  async purge(owned: AccountOwnership): Promise<PurgeCounts> {
    const counts = await run(owned, async (model, filter) => {
      const res = await model.deleteMany(filter);
      return res.deletedCount ?? 0;
    });
    // El usuario va último de todo: mientras exista, la cuenta sigue siendo
    // identificable para retomar un borrado interrumpido.
    const res = await User.deleteOne({ _id: owned.accountId });
    if (res.deletedCount) counts.User = res.deletedCount;
    return counts;
  },
};
