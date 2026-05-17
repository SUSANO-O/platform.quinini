/**
 * GET /api/admin/model-stats
 *
 * Ranking de modelos: cuántos agentes los usan como principal / respaldo,
 * total de peticiones acumuladas y última fecha de uso real (vía RequestLog).
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, ClientAgent, Widget, RequestLog } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { financeRateConfig } from '@/lib/finance-aggregate';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const uid = verifySessionToken(token);
  if (!uid) return null;
  await connectDB();
  const user = (await User.findById(uid).lean()) as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return uid;
}

type AgentDoc = {
  _id: { toString(): string };
  model?: string;
  fallbackModels?: string[];
  updatedAt?: Date;
  userId?: string;
};

type WidgetDoc = {
  _id: { toString(): string };
  agentId?: string;
  name?: string;
  userId?: string;
};

type LogDoc = {
  widgetId: string;
  month: string;
  count: number;
  inputTokens?: number;
  outputTokens?: number;
  updatedAt?: Date;
};

export type WidgetBreakdownRow = {
  widgetId: string;
  widgetName: string | null;
  requests: number;
  realInputTokens: number;
  realOutputTokens: number;
  realTotalTokens: number;
  estimatedTokens: number;
  estimatedUsd: number;
  hasRealTokens: boolean;
};

export type ModelStatRow = {
  modelId: string;
  primaryCount: number;
  fallbackCount: number;
  totalRequests: number;
  estimatedTokens: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedUsd: number;
  realInputTokens: number;
  realOutputTokens: number;
  realTotalTokens: number;
  hasRealTokens: boolean;
  modelClass: 'flash' | 'default' | 'premium';
  lastUsedMonth: string | null;
  lastUsedAt: string | null;
  lastWidgetId: string | null;
  lastWidgetName: string | null;
  lastAgentUpdatedAt: string | null;
  widgets: WidgetBreakdownRow[];
};

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  await connectDB();

  // Optional date filter: ?from=YYYY-MM&to=YYYY-MM (inclusive)
  const { searchParams } = new URL(req.url);
  const fromMonth = searchParams.get('from') ?? null; // e.g. "2025-01"
  const toMonth = searchParams.get('to') ?? null;     // e.g. "2025-12"

  // ── 1. Leer todos los agentes ─────────────────────────────────────────────
  const agents = (await ClientAgent.find(
    {},
    { model: 1, fallbackModels: 1, userId: 1, updatedAt: 1 },
  ).lean()) as AgentDoc[];

  // ── 2. Construir mapa modelId → stats básicos ─────────────────────────────
  const map = new Map<string, {
    primaryCount: number;
    fallbackCount: number;
    agentIds: string[];
    lastAgentUpdatedAt: Date | null;
  }>();

  function touch(modelId: string, agentId: string, isPrimary: boolean, updatedAt?: Date) {
    if (!map.has(modelId)) {
      map.set(modelId, { primaryCount: 0, fallbackCount: 0, agentIds: [], lastAgentUpdatedAt: null });
    }
    const e = map.get(modelId)!;
    if (isPrimary) {
      e.primaryCount++;
      if (!e.agentIds.includes(agentId)) e.agentIds.push(agentId);
      if (updatedAt && (!e.lastAgentUpdatedAt || updatedAt > e.lastAgentUpdatedAt)) {
        e.lastAgentUpdatedAt = updatedAt;
      }
    } else {
      e.fallbackCount++;
    }
  }

  for (const a of agents) {
    const mid = (a.model || 'gemini-2.5-flash').trim();
    touch(mid, a._id.toString(), true, a.updatedAt);
    for (const fm of a.fallbackModels ?? []) {
      if (fm && fm.trim()) touch(fm.trim(), a._id.toString(), false);
    }
  }

  // ── 3. Helpers de tokens y coste ─────────────────────────────────────────
  const rates = financeRateConfig();

  type ModelClass = 'flash' | 'default' | 'premium';

  function classifyModel(modelId: string): ModelClass {
    const m = modelId.toLowerCase();
    if (m.includes('flash') || m.includes('mini') || m.includes('nano') || m.includes('small')) return 'flash';
    if (m.includes('pro') || m.includes('ultra') || m.includes('claude') || m.includes('gpt-4') || m.includes('gpt-5') || m.includes('sonnet') || m.includes('opus')) return 'premium';
    return 'default';
  }

  /** Tokens estimados por petición según clase de modelo */
  const TOKEN_EST: Record<ModelClass, { input: number; output: number }> = {
    flash:   { input: 350, output: 100 },
    default: { input: 550, output: 150 },
    premium: { input: 750, output: 200 },
  };

  function usdForModel(modelClass: ModelClass, requests: number): number {
    const base = modelClass === 'flash' ? rates.flashRate : modelClass === 'premium' ? rates.premiumRate : rates.defaultRate;
    return Math.round(requests * base * 10000) / 10000;
  }

  // ── 4. Para cada modelo → widgets → RequestLog ────────────────────────────
  const rows: ModelStatRow[] = [];

  // Pre-fetch all widgets (evita N queries)
  const allWidgets = (await Widget.find({}, { _id: 1, agentId: 1, name: 1 }).lean()) as WidgetDoc[];
  const widgetByAgent = new Map<string, WidgetDoc[]>();
  for (const w of allWidgets) {
    const aid = w.agentId ?? '';
    if (!widgetByAgent.has(aid)) widgetByAgent.set(aid, []);
    widgetByAgent.get(aid)!.push(w);
  }

  // Pre-fetch request logs — apply month range filter if provided
  const logFilter: Record<string, unknown> = {};
  if (fromMonth || toMonth) {
    const range: Record<string, string> = {};
    if (fromMonth) range.$gte = fromMonth;
    if (toMonth) range.$lte = toMonth;
    logFilter.month = range;
  }
  const allLogs = (await RequestLog.find(logFilter, { widgetId: 1, month: 1, count: 1, inputTokens: 1, outputTokens: 1, updatedAt: 1 }).lean()) as LogDoc[];
  const logsByWidget = new Map<string, LogDoc[]>();
  for (const l of allLogs) {
    if (!logsByWidget.has(l.widgetId)) logsByWidget.set(l.widgetId, []);
    logsByWidget.get(l.widgetId)!.push(l);
  }

  for (const [modelId, entry] of map) {
    let totalRequests = 0;
    let realInputTokens = 0;
    let realOutputTokens = 0;
    let lastUsedMonth: string | null = null;
    let lastUsedAt: string | null = null;
    let lastWidgetId: string | null = null;
    let lastWidgetName: string | null = null;

    const modelClass = classifyModel(modelId);
    const tokEst = TOKEN_EST[modelClass];
    const widgetBreakdown: WidgetBreakdownRow[] = [];

    for (const agentId of entry.agentIds) {
      const widgets = widgetByAgent.get(agentId) ?? [];
      for (const w of widgets) {
        const wid = w._id.toString();
        const logs = logsByWidget.get(wid) ?? [];
        let wRequests = 0;
        let wInputTokens = 0;
        let wOutputTokens = 0;

        for (const l of logs) {
          const cnt = l.count ?? 0;
          wRequests += cnt;
          wInputTokens += l.inputTokens ?? 0;
          wOutputTokens += l.outputTokens ?? 0;
          if (!lastUsedMonth || l.month > lastUsedMonth) {
            lastUsedMonth = l.month;
            lastWidgetId = wid;
            lastWidgetName = w.name ?? null;
            lastUsedAt = l.updatedAt
              ? new Date(l.updatedAt).toISOString()
              : `${l.month}-28T00:00:00.000Z`;
          }
        }

        if (wRequests > 0) {
          totalRequests += wRequests;
          realInputTokens += wInputTokens;
          realOutputTokens += wOutputTokens;
          const wHasReal = wInputTokens + wOutputTokens > 0;
          const wEst = Math.round(wRequests * (tokEst.input + tokEst.output));
          widgetBreakdown.push({
            widgetId: wid,
            widgetName: w.name ?? null,
            requests: wRequests,
            realInputTokens: wInputTokens,
            realOutputTokens: wOutputTokens,
            realTotalTokens: wInputTokens + wOutputTokens,
            estimatedTokens: wEst,
            estimatedUsd: usdForModel(modelClass, wRequests),
            hasRealTokens: wHasReal,
          });
        }
      }
    }

    widgetBreakdown.sort((a, b) => b.requests - a.requests);

    const estimatedInputTokens = Math.round(totalRequests * tokEst.input);
    const estimatedOutputTokens = Math.round(totalRequests * tokEst.output);
    const hasRealTokens = realInputTokens + realOutputTokens > 0;

    rows.push({
      modelId,
      primaryCount: entry.primaryCount,
      fallbackCount: entry.fallbackCount,
      totalRequests,
      estimatedTokens: estimatedInputTokens + estimatedOutputTokens,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedUsd: usdForModel(modelClass, totalRequests),
      realInputTokens,
      realOutputTokens,
      realTotalTokens: realInputTokens + realOutputTokens,
      hasRealTokens,
      modelClass,
      lastUsedMonth,
      lastUsedAt,
      lastWidgetId,
      lastWidgetName,
      lastAgentUpdatedAt: entry.lastAgentUpdatedAt
        ? entry.lastAgentUpdatedAt.toISOString()
        : null,
      widgets: widgetBreakdown,
    });
  }

  // ── 5. Ordenar: más peticiones → más agentes → nombre ────────────────────
  rows.sort((a, b) => {
    if (b.totalRequests !== a.totalRequests) return b.totalRequests - a.totalRequests;
    if (b.primaryCount !== a.primaryCount) return b.primaryCount - a.primaryCount;
    return a.modelId.localeCompare(b.modelId);
  });

  return NextResponse.json({
    ok: true,
    models: rows,
    total: rows.length,
    filter: { from: fromMonth, to: toMonth },
  });
}
