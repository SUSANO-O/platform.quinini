/**
 * Contadores diarios de conversaciones por pool (Colombia UTC-5).
 */

import { connectDB } from '@/lib/db/connection';
import { ConversationDailyLog } from '@/lib/db/models';
import type { ConversationPool } from '@/lib/conversation-pools';
import { COLOMBIA_OFFSET_MS, colombiaDateKey } from '@/lib/colombia-time';

export { COLOMBIA_OFFSET_MS, colombiaDateKey };

/** Incrementa contador diario tras consumo facturable. */
export async function incrementDailyConversationUsage(
  userId: string,
  pool: ConversationPool,
  weight = 1,
  at: Date = new Date(),
): Promise<void> {
  if (!userId || weight <= 0) return;
  await connectDB();
  const date = colombiaDateKey(at);
  await ConversationDailyLog.updateOne(
    { userId, date, pool },
    { $inc: { count: weight } },
    { upsert: true },
  );
}

export type DailyConversationPoint = {
  date: string;
  agents: number;
  api: number;
  sessions: number;
};

/** Serie diaria widget + API para gráfico (fallback widget → WidgetMessage). */
export async function countUserDailyConversationSeries(
  userId: string,
  from: Date,
  to: Date,
  widgetTurnsByDay: Map<string, number>,
  sessionsByDay: Map<string, number>,
): Promise<DailyConversationPoint[]> {
  await connectDB();

  const fromKey = colombiaDateKey(from);
  const toKey = colombiaDateKey(to);

  const logs = await ConversationDailyLog.find({
    userId,
    date: { $gte: fromKey, $lte: toKey },
  })
    .select({ date: 1, pool: 1, count: 1 })
    .lean() as { date: string; pool: string; count: number }[];

  const agentsLog = new Map<string, number>();
  const apiLog = new Map<string, number>();
  for (const row of logs) {
    if (row.pool === 'api') apiLog.set(row.date, row.count);
    else agentsLog.set(row.date, row.count);
  }

  const days: DailyConversationPoint[] = [];
  const cursor = new Date(from.getTime() - COLOMBIA_OFFSET_MS);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to.getTime() - COLOMBIA_OFFSET_MS);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    const key = colombiaDateKey(new Date(cursor.getTime() + COLOMBIA_OFFSET_MS));
    const agents = Math.max(agentsLog.get(key) ?? 0, widgetTurnsByDay.get(key) ?? 0);
    days.push({
      date: key,
      agents,
      api: apiLog.get(key) ?? 0,
      sessions: sessionsByDay.get(key) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}
