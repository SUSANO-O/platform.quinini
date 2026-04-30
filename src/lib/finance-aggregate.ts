/**
 * Agregados de uso para panel financiero (estimación de coste interno).
 */

import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { RequestLog, Widget, ClientAgent } from '@/lib/db/models';

/** Coste estimado por mensaje conversacional facturable (USD). Override con FINANCE_EST_USD_PER_MESSAGE */
export function estimatedUsdPerMessage(): number {
  const raw = process.env.FINANCE_EST_USD_PER_MESSAGE;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0.003;
}

export type FinanceRow = {
  month: string;
  widgetId: string;
  agentLabel: string;
  billableMessages: number;
  estimatedUsd: number;
};

export async function buildFinanceSummary(userId: string): Promise<{
  currency: 'USD';
  rateUsdPerMessage: number;
  months: string[];
  rows: FinanceRow[];
  totalsByMonth: Record<string, { messages: number; estimatedUsd: number }>;
}> {
  await connectDB();

  const rate = estimatedUsdPerMessage();

  const logs = await RequestLog.find({ userId })
    .sort({ month: -1 })
    .limit(2000)
    .lean();

  const widgetIds = [...new Set(logs.map((l) => String(l.widgetId)))];
  const oidList = widgetIds
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const widgets = oidList.length
    ? await Widget.find({ _id: { $in: oidList } })
        .select({ name: 1, agentId: 1 })
        .lean()
    : [];

  const widMap = new Map<string, { name?: string; agentId?: string }>();
  for (const w of widgets) {
    widMap.set(String(w._id), { name: w.name, agentId: w.agentId });
  }

  const agents = await ClientAgent.find({ userId }).select({ name: 1, agentHubId: 1 }).lean();
  const agentByHub = new Map<string, string>();
  for (const a of agents) {
    if (a.agentHubId) agentByHub.set(String(a.agentHubId), a.name);
    agentByHub.set(String(a._id), a.name);
  }

  const rows: FinanceRow[] = [];
  const totalsByMonth: Record<string, { messages: number; estimatedUsd: number }> = {};

  for (const l of logs) {
    const month = String(l.month || '');
    const widgetId = String(l.widgetId || '');
    const count = typeof l.count === 'number' ? l.count : 0;
    const w = widMap.get(widgetId);
    let agentLabel = w?.name || widgetId.slice(0, 8);
    if (w?.agentId) {
      const nm = agentByHub.get(w.agentId);
      if (nm) agentLabel = `${nm} (${w.agentId.slice(0, 8)}…)`;
      else agentLabel = String(w.agentId).slice(0, 14);
    }
    const estimatedUsd = Math.round(count * rate * 10000) / 10000;
    rows.push({
      month,
      widgetId,
      agentLabel,
      billableMessages: count,
      estimatedUsd,
    });
    if (!totalsByMonth[month]) totalsByMonth[month] = { messages: 0, estimatedUsd: 0 };
    totalsByMonth[month].messages += count;
    totalsByMonth[month].estimatedUsd += estimatedUsd;
  }

  const months = [...new Set(rows.map((r) => r.month))].sort().reverse();

  return {
    currency: 'USD',
    rateUsdPerMessage: rate,
    months,
    rows,
    totalsByMonth,
  };
}
