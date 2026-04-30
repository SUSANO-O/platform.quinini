/**
 * Agregados de uso para panel financiero (estimación de coste interno).
 */

import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { RequestLog, Widget, ClientAgent, Subscription, User } from '@/lib/db/models';

/** Coste estimado por mensaje conversacional facturable (USD). Override con FINANCE_EST_USD_PER_MESSAGE */
export function estimatedUsdPerMessage(): number {
  const raw = process.env.FINANCE_EST_USD_PER_MESSAGE;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0.003;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function financeRateConfig() {
  const defaultRate = estimatedUsdPerMessage();
  return {
    defaultRate,
    flashRate: envNumber('FINANCE_EST_USD_PER_MESSAGE_FLASH', 0.0005),
    premiumRate: envNumber('FINANCE_EST_USD_PER_MESSAGE_PREMIUM', 0.004),
    ragMultiplier: envNumber('FINANCE_EST_RAG_MULTIPLIER', 1.8),
  };
}

type ModelClass = 'default' | 'flash' | 'premium';

function classifyModelClass(model: string): ModelClass {
  const m = model.toLowerCase();
  if (!m) return 'default';
  if (
    m.includes('flash') ||
    m.includes('mini') ||
    m.includes('nano') ||
    m.includes('small')
  ) return 'flash';
  if (
    m.includes('pro') ||
    m.includes('ultra') ||
    m.includes('claude') ||
    m.includes('gpt-4') ||
    m.includes('gpt-5') ||
    m.includes('sonnet') ||
    m.includes('opus')
  ) return 'premium';
  return 'default';
}

function modelRate(modelClass: ModelClass, ragEnabled: boolean): number {
  const cfg = financeRateConfig();
  const base =
    modelClass === 'flash'
      ? cfg.flashRate
      : modelClass === 'premium'
        ? cfg.premiumRate
        : cfg.defaultRate;
  const withRag = ragEnabled ? base * cfg.ragMultiplier : base;
  return Math.round(withRag * 1_000_000) / 1_000_000;
}

export type FinanceRow = {
  month: string;
  widgetId: string;
  agentLabel: string;
  billableMessages: number;
  estimatedUsd: number;
  modelClass: ModelClass;
  ragEnabled: boolean;
  effectiveUsdPerMessage: number;
};

export async function buildFinanceSummary(userId: string): Promise<{
  currency: 'USD';
  rateUsdPerMessage: number;
  rates: {
    defaultRate: number;
    flashRate: number;
    premiumRate: number;
    ragMultiplier: number;
  };
  months: string[];
  rows: FinanceRow[];
  totalsByMonth: Record<string, { messages: number; estimatedUsd: number }>;
}> {
  await connectDB();
  const rates = financeRateConfig();

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

  const agents = await ClientAgent.find({ userId }).select({ name: 1, agentHubId: 1, model: 1, ragEnabled: 1 }).lean();
  const agentByHub = new Map<string, { name: string; model: string; ragEnabled: boolean }>();
  for (const a of agents) {
    const meta = {
      name: a.name || '',
      model: typeof a.model === 'string' ? a.model : '',
      ragEnabled: Boolean(a.ragEnabled),
    };
    if (a.agentHubId) agentByHub.set(String(a.agentHubId), meta);
    agentByHub.set(String(a._id), meta);
  }

  const rows: FinanceRow[] = [];
  const totalsByMonth: Record<string, { messages: number; estimatedUsd: number }> = {};

  for (const l of logs) {
    const month = String(l.month || '');
    const widgetId = String(l.widgetId || '');
    const count = typeof l.count === 'number' ? l.count : 0;
    const w = widMap.get(widgetId);
    let agentLabel = w?.name || widgetId.slice(0, 8);
    let modelClass: ModelClass = 'default';
    let ragEnabled = false;
    if (w?.agentId) {
      const agentMeta = agentByHub.get(w.agentId);
      if (agentMeta?.name) agentLabel = `${agentMeta.name} (${w.agentId.slice(0, 8)}…)`;
      else agentLabel = String(w.agentId).slice(0, 14);
      modelClass = classifyModelClass(agentMeta?.model || '');
      ragEnabled = Boolean(agentMeta?.ragEnabled);
    }
    const effectiveUsdPerMessage = modelRate(modelClass, ragEnabled);
    const estimatedUsd = Math.round(count * effectiveUsdPerMessage * 10000) / 10000;
    rows.push({
      month,
      widgetId,
      agentLabel,
      billableMessages: count,
      estimatedUsd,
      modelClass,
      ragEnabled,
      effectiveUsdPerMessage,
    });
    if (!totalsByMonth[month]) totalsByMonth[month] = { messages: 0, estimatedUsd: 0 };
    totalsByMonth[month].messages += count;
    totalsByMonth[month].estimatedUsd += estimatedUsd;
  }

  const months = [...new Set(rows.map((r) => r.month))].sort().reverse();

  return {
    currency: 'USD',
    rateUsdPerMessage: rates.defaultRate,
    rates,
    months,
    rows,
    totalsByMonth,
  };
}

type TenantFinanceOverview = {
  userId: string;
  email: string;
  plan: string;
  status: string;
  totalMessages: number;
  estimatedUsd: number;
  widgets: number;
  agents: number;
  lastActiveMonth: string;
};

export async function buildAdminFinanceSummary(): Promise<{
  currency: 'USD';
  rateUsdPerMessage: number;
  rates: {
    defaultRate: number;
    flashRate: number;
    premiumRate: number;
    ragMultiplier: number;
  };
  totals: {
    tenants: number;
    totalMessages: number;
    estimatedUsd: number;
  };
  tenants: TenantFinanceOverview[];
}> {
  await connectDB();
  const rates = financeRateConfig();

  const [users, subs, logs, widgetsByUser, agentsByUser, allWidgets, allAgents] = await Promise.all([
    User.find({ role: { $ne: 'admin' } }).select({ email: 1 }).lean() as Promise<Array<{ _id: { toString(): string }; email?: string }>>,
    Subscription.find({}).select({ userId: 1, plan: 1, status: 1 }).lean() as Promise<Array<{ userId?: string; plan?: string; status?: string }>>,
    RequestLog.find({}).select({ userId: 1, widgetId: 1, month: 1, count: 1 }).lean() as Promise<Array<{ userId?: string; widgetId?: string; month?: string; count?: number }>>,
    Widget.aggregate([
      { $group: { _id: '$userId', widgets: { $sum: 1 } } },
    ]) as Promise<Array<{ _id: string; widgets: number }>>,
    ClientAgent.aggregate([
      { $match: { type: 'agent', isPlatform: { $ne: true } } },
      { $group: { _id: '$userId', agents: { $sum: 1 } } },
    ]) as Promise<Array<{ _id: string; agents: number }>>,
    Widget.find({}).select({ _id: 1, agentId: 1 }).lean() as Promise<Array<{ _id: { toString(): string }; agentId?: string }>>,
    ClientAgent.find({}).select({ _id: 1, agentHubId: 1, model: 1, ragEnabled: 1 }).lean() as Promise<Array<{ _id: { toString(): string }; agentHubId?: string; model?: string; ragEnabled?: boolean }>>,
  ]);

  const userMap = new Map<string, { email: string }>();
  for (const u of users) userMap.set(String(u._id), { email: u.email || '' });

  const subMap = new Map<string, { plan: string; status: string }>();
  for (const s of subs) {
    if (!s.userId) continue;
    subMap.set(s.userId, {
      plan: s.plan || 'free',
      status: s.status || 'trialing',
    });
  }

  const widgetMap = new Map<string, number>();
  for (const row of widgetsByUser) widgetMap.set(String(row._id), row.widgets || 0);

  const agentMap = new Map<string, number>();
  for (const row of agentsByUser) agentMap.set(String(row._id), row.agents || 0);

  const widgetToAgent = new Map<string, string>();
  for (const w of allWidgets) {
    widgetToAgent.set(String(w._id), String(w.agentId || ''));
  }

  const agentMetaMap = new Map<string, { modelClass: ModelClass; ragEnabled: boolean }>();
  for (const a of allAgents) {
    const meta = {
      modelClass: classifyModelClass(a.model || ''),
      ragEnabled: Boolean(a.ragEnabled),
    };
    if (a.agentHubId) agentMetaMap.set(String(a.agentHubId), meta);
    agentMetaMap.set(String(a._id), meta);
  }

  const usageMap = new Map<string, { totalMessages: number; estimatedUsd: number; lastActiveMonth: string }>();
  for (const row of logs) {
    const uid = String(row.userId || '');
    if (!uid) continue;
    const count = typeof row.count === 'number' ? row.count : 0;
    const month = String(row.month || '');
    const widgetId = String(row.widgetId || '');
    const agentId = widgetToAgent.get(widgetId) || '';
    const agentMeta = agentMetaMap.get(agentId);
    const effectiveRate = modelRate(agentMeta?.modelClass || 'default', Boolean(agentMeta?.ragEnabled));
    const estimatedUsd = Math.round(count * effectiveRate * 10000) / 10000;
    const prev = usageMap.get(uid) || { totalMessages: 0, estimatedUsd: 0, lastActiveMonth: '' };
    usageMap.set(uid, {
      totalMessages: prev.totalMessages + count,
      estimatedUsd: Math.round((prev.estimatedUsd + estimatedUsd) * 10000) / 10000,
      lastActiveMonth: prev.lastActiveMonth > month ? prev.lastActiveMonth : month,
    });
  }

  const tenantIds = new Set<string>([
    ...Array.from(userMap.keys()),
    ...Array.from(usageMap.keys()),
    ...Array.from(widgetMap.keys()),
    ...Array.from(agentMap.keys()),
  ]);

  const tenants: TenantFinanceOverview[] = Array.from(tenantIds).map((userId) => {
    const usage = usageMap.get(userId);
    const messages = usage?.totalMessages || 0;
    return {
      userId,
      email: userMap.get(userId)?.email || userId,
      plan: subMap.get(userId)?.plan || 'free',
      status: subMap.get(userId)?.status || 'no_sub',
      totalMessages: messages,
      estimatedUsd: usage?.estimatedUsd || 0,
      widgets: widgetMap.get(userId) || 0,
      agents: agentMap.get(userId) || 0,
      lastActiveMonth: usage?.lastActiveMonth || '',
    };
  });

  tenants.sort((a, b) => b.estimatedUsd - a.estimatedUsd || b.totalMessages - a.totalMessages);

  const totals = tenants.reduce(
    (acc, t) => {
      acc.totalMessages += t.totalMessages;
      acc.estimatedUsd += t.estimatedUsd;
      return acc;
    },
    { tenants: tenants.length, totalMessages: 0, estimatedUsd: 0 },
  );
  totals.estimatedUsd = Math.round(totals.estimatedUsd * 10000) / 10000;

  return {
    currency: 'USD',
    rateUsdPerMessage: rates.defaultRate,
    rates,
    totals,
    tenants,
  };
}
