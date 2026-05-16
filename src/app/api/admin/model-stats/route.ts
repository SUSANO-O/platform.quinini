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
  updatedAt?: Date;
};

export type ModelStatRow = {
  modelId: string;
  primaryCount: number;
  fallbackCount: number;
  totalRequests: number;
  lastUsedMonth: string | null;
  lastUsedAt: string | null;
  lastWidgetId: string | null;
  lastWidgetName: string | null;
  lastAgentUpdatedAt: string | null;
};

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  await connectDB();

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

  // ── 3. Para cada modelo → widgets → RequestLog ────────────────────────────
  const rows: ModelStatRow[] = [];

  // Pre-fetch all widgets (evita N queries)
  const allWidgets = (await Widget.find({}, { _id: 1, agentId: 1, name: 1 }).lean()) as WidgetDoc[];
  const widgetByAgent = new Map<string, WidgetDoc[]>();
  for (const w of allWidgets) {
    const aid = w.agentId ?? '';
    if (!widgetByAgent.has(aid)) widgetByAgent.set(aid, []);
    widgetByAgent.get(aid)!.push(w);
  }

  // Pre-fetch all request logs
  const allLogs = (await RequestLog.find({}, { widgetId: 1, month: 1, count: 1, updatedAt: 1 }).lean()) as LogDoc[];
  const logsByWidget = new Map<string, LogDoc[]>();
  for (const l of allLogs) {
    if (!logsByWidget.has(l.widgetId)) logsByWidget.set(l.widgetId, []);
    logsByWidget.get(l.widgetId)!.push(l);
  }

  for (const [modelId, entry] of map) {
    let totalRequests = 0;
    let lastUsedMonth: string | null = null;
    let lastUsedAt: string | null = null;
    let lastWidgetId: string | null = null;
    let lastWidgetName: string | null = null;

    for (const agentId of entry.agentIds) {
      const widgets = widgetByAgent.get(agentId) ?? [];
      for (const w of widgets) {
        const wid = w._id.toString();
        const logs = logsByWidget.get(wid) ?? [];
        for (const l of logs) {
          totalRequests += l.count ?? 0;
          if (!lastUsedMonth || l.month > lastUsedMonth) {
            lastUsedMonth = l.month;
            lastWidgetId = wid;
            lastWidgetName = w.name ?? null;
            // Approximate date from month string "YYYY-MM" → last day of month
            lastUsedAt = l.updatedAt
              ? new Date(l.updatedAt).toISOString()
              : `${l.month}-28T00:00:00.000Z`;
          }
        }
      }
    }

    rows.push({
      modelId,
      primaryCount: entry.primaryCount,
      fallbackCount: entry.fallbackCount,
      totalRequests,
      lastUsedMonth,
      lastUsedAt,
      lastWidgetId,
      lastWidgetName,
      lastAgentUpdatedAt: entry.lastAgentUpdatedAt
        ? entry.lastAgentUpdatedAt.toISOString()
        : null,
    });
  }

  // ── 4. Ordenar: más peticiones → más agentes → nombre ────────────────────
  rows.sort((a, b) => {
    if (b.totalRequests !== a.totalRequests) return b.totalRequests - a.totalRequests;
    if (b.primaryCount !== a.primaryCount) return b.primaryCount - a.primaryCount;
    return a.modelId.localeCompare(b.modelId);
  });

  return NextResponse.json({ ok: true, models: rows, total: rows.length });
}
