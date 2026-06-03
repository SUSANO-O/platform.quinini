/**
 * GET /api/admin/model-stats
 *
 * Ranking de modelos con filtros opcionales por fecha, widget, agente, usuario y modelo.
 * Usa aggregation pipeline de MongoDB para que todos los filtros se ejecuten con índices,
 * sin cargar colecciones completas en memoria.
 *
 * Query params:
 *   from     YYYY-MM  mes inicial (inclusive)
 *   to       YYYY-MM  mes final (inclusive)
 *   widgetId string   filtrar por ID de widget concreto
 *   agentId  string   filtrar por ID de agente concreto
 *   userId   string   filtrar por ID de usuario/tenant
 *   model    string   filtrar por ID de modelo concreto
 */

import { NextRequest, NextResponse } from 'next/server';
import type { PipelineStage } from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { User, ClientAgent, RequestLog } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import {
  classifyModelTier,
  estimateRequestCostUsd,
  estimatedTokensForRequests,
  costCalibrationFactor,
  invoiceBlendUsdPer1M,
  type ModelTier,
} from '@/lib/llm-cost';

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
};

export type WidgetBreakdownRow = {
  widgetId: string;
  widgetName: string | null;
  agentId: string | null;
  requests: number;
  realInputTokens: number;
  realOutputTokens: number;
  realTotalTokens: number;
  estimatedTokens: number;
  estimatedUsd: number;
  hasRealTokens: boolean;
  lastMonth: string | null;
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
  modelClass: ModelTier;
  lastUsedMonth: string | null;
  lastUsedAt: string | null;
  lastWidgetId: string | null;
  lastWidgetName: string | null;
  lastAgentUpdatedAt: string | null;
  widgets: WidgetBreakdownRow[];
};

// ── Helpers compartidos ──────────────────────────────────────────────────────

type ModelClass = ModelTier;

// ── Raw aggregation result shape ─────────────────────────────────────────────

type AggWidgetRow = {
  widgetId: string;
  widgetName: string | null;
  agentId: string | null;
  requests: number;
  realInputTokens: number;
  realOutputTokens: number;
  lastMonth: string | null;
  lastUpdatedAt: Date | null;
};

type AggModelRow = {
  _id: string | null; // modelId
  totalRequests: number;
  realInputTokens: number;
  realOutputTokens: number;
  lastMonth: string | null;
  lastUpdatedAt: Date | null;
  widgets: AggWidgetRow[];
};

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const fromMonth    = searchParams.get('from')     ?? null;
  const toMonth      = searchParams.get('to')       ?? null;
  const filterWidget = searchParams.get('widgetId') ?? null;
  const filterAgent  = searchParams.get('agentId')  ?? null;
  const filterUser   = searchParams.get('userId')   ?? null;
  const filterModel  = searchParams.get('model')    ?? null;
  const rawMode      = searchParams.get('mode')     ?? 'realistic';
  const costMode: 'api' | 'invoice' | 'realistic' =
    rawMode === 'api' || rawMode === 'invoice' ? rawMode : 'realistic';

  // ── 1. Aggregation pipeline (filtros en MongoDB, con índices) ───────────────

  // Etapa $match inicial — usa índices compuestos de RequestLog:
  //   { widgetId:1, month:-1 }, { userId:1, month:-1 }, { month:1 }
  const matchStage: Record<string, unknown> = {};
  if (fromMonth || toMonth) {
    const r: Record<string, string> = {};
    if (fromMonth) r.$gte = fromMonth;
    if (toMonth)   r.$lte = toMonth;
    matchStage.month = r;
  }
  if (filterWidget) matchStage.widgetId = filterWidget;
  if (filterUser)   matchStage.userId   = filterUser;

  // $lookup Widget: widgetId (String) → widgets._id (ObjectId).
  // Usamos $convert con onError:null para que IDs malformados no rompan el pipeline.
  // MongoDB usa el índice _id dentro del sub-pipeline de $lookup.
  const lookupWidget = {
    $lookup: {
      from: 'widgets',
      let: { wid: { $convert: { input: '$widgetId', to: 'objectId', onError: null, onNull: null } } },
      pipeline: [
        { $match: { $expr: { $eq: ['$_id', '$$wid'] } } },
        { $project: { name: 1, agentId: 1 } },
      ],
      as: '_widget',
    },
  };

  // $lookup ClientAgent: agentId (String) → clientagents._id (ObjectId).
  const lookupAgent = {
    $lookup: {
      from: 'clientagents',
      let: { aid: { $convert: { input: { $arrayElemAt: ['$_widget.agentId', 0] }, to: 'objectId', onError: null, onNull: null } } },
      pipeline: [
        { $match: { $expr: { $eq: ['$_id', '$$aid'] } } },
        { $project: { model: 1 } },
      ],
      as: '_agent',
    },
  };

  const pipeline: PipelineStage[] = [
    { $match: matchStage },
    lookupWidget,

    // Filtrar por agentId concreto (antes del $lookup de agente para evitar trabajo extra)
    ...(filterAgent ? [{ $match: { '_widget.agentId': filterAgent } }] : []),

    lookupAgent,

    // Campo computado: modelId
    {
      $addFields: {
        _modelId: {
          $ifNull: [
            { $arrayElemAt: ['$_agent.model', 0] },
            'unknown',
          ],
        },
        _widgetDoc: { $arrayElemAt: ['$_widget', 0] },
      },
    },

    // Filtrar por modelo concreto
    ...(filterModel ? [{ $match: { _modelId: filterModel } }] : []),

    // Agrupar por (modelo, widget) → stats por widget
    {
      $group: {
        _id: { model: '$_modelId', widgetId: '$widgetId' },
        widgetName:      { $first: '$_widgetDoc.name' },
        agentId:         { $first: '$_widgetDoc.agentId' },
        requests:        { $sum: '$count' },
        realInputTokens: { $sum: { $ifNull: ['$inputTokens',  0] } },
        realOutputTokens:{ $sum: { $ifNull: ['$outputTokens', 0] } },
        lastMonth:       { $max: '$month' },
        lastUpdatedAt:   { $max: '$updatedAt' },
      },
    },

    // Agrupar por modelo → stats totales + array de widgets
    {
      $group: {
        _id: '$_id.model',
        totalRequests:    { $sum: '$requests' },
        realInputTokens:  { $sum: '$realInputTokens' },
        realOutputTokens: { $sum: '$realOutputTokens' },
        lastMonth:        { $max: '$lastMonth' },
        lastUpdatedAt:    { $max: '$lastUpdatedAt' },
        widgets: {
          $push: {
            widgetId:         '$_id.widgetId',
            widgetName:       '$widgetName',
            agentId:          '$agentId',
            requests:         '$requests',
            realInputTokens:  '$realInputTokens',
            realOutputTokens: '$realOutputTokens',
            lastMonth:        '$lastMonth',
            lastUpdatedAt:    '$lastUpdatedAt',
          },
        },
      },
    },

    { $sort: { totalRequests: -1 } },
  ];

  // ── 2. Consulta de config de agentes (en paralelo con el pipeline) ──────────
  // Necesaria para primaryCount/fallbackCount/lastAgentUpdatedAt.
  const agentFilter: Record<string, unknown> = {};
  if (filterModel) agentFilter.$or = [{ model: filterModel }, { fallbackModels: filterModel }];

  const [aggResults, agents] = await Promise.all([
    RequestLog.aggregate(pipeline).allowDiskUse(false).exec() as Promise<AggModelRow[]>,
    ClientAgent.find(agentFilter, { model: 1, fallbackModels: 1, updatedAt: 1 }).lean() as Promise<AgentDoc[]>,
  ]);

  // ── 3. Mapa de config por modelo ─────────────────────────────────────────────
  const configMap = new Map<string, { primaryCount: number; fallbackCount: number; lastAgentUpdatedAt: Date | null }>();

  for (const a of agents) {
    const mid = (a.model || 'gemini-2.5-flash').trim();
    if (!configMap.has(mid)) configMap.set(mid, { primaryCount: 0, fallbackCount: 0, lastAgentUpdatedAt: null });
    const e = configMap.get(mid)!;
    e.primaryCount++;
    if (a.updatedAt && (!e.lastAgentUpdatedAt || a.updatedAt > e.lastAgentUpdatedAt)) {
      e.lastAgentUpdatedAt = a.updatedAt;
    }
    for (const fm of a.fallbackModels ?? []) {
      if (!fm?.trim()) continue;
      const fid = fm.trim();
      if (!configMap.has(fid)) configMap.set(fid, { primaryCount: 0, fallbackCount: 0, lastAgentUpdatedAt: null });
      configMap.get(fid)!.fallbackCount++;
    }
  }

  // ── 4. Ensamblar filas finales ────────────────────────────────────────────────
  const rows: ModelStatRow[] = [];
  const seenModels = new Set<string>();

  for (const agg of aggResults) {
    const modelId   = agg._id ?? 'unknown';
    seenModels.add(modelId);
    const cfg       = configMap.get(modelId) ?? { primaryCount: 0, fallbackCount: 0, lastAgentUpdatedAt: null };
    const mc        = classifyModelTier(modelId);
    const hasReal   = agg.realInputTokens + agg.realOutputTokens > 0;
    const tokenEst  = estimatedTokensForRequests(modelId, agg.totalRequests);

    // Ordenar y enriquecer widgets
    const sortedWidgets: WidgetBreakdownRow[] = (agg.widgets ?? [])
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 200)
      .map((w) => {
        const wHasReal = w.realInputTokens + w.realOutputTokens > 0;
        const wTokEst = estimatedTokensForRequests(modelId, w.requests);
        return {
          widgetId:         w.widgetId,
          widgetName:       w.widgetName ?? null,
          agentId:          w.agentId ?? null,
          requests:         w.requests,
          realInputTokens:  w.realInputTokens,
          realOutputTokens: w.realOutputTokens,
          realTotalTokens:  w.realInputTokens + w.realOutputTokens,
          estimatedTokens:  wHasReal ? w.realInputTokens + w.realOutputTokens : wTokEst.total,
          estimatedUsd:     estimateRequestCostUsd(modelId, w.requests, w.realInputTokens, w.realOutputTokens, costMode),
          hasRealTokens:    wHasReal,
          lastMonth:        w.lastMonth,
        };
      });

    const topWidget = sortedWidgets[0] ?? null;

    rows.push({
      modelId,
      primaryCount:          cfg.primaryCount,
      fallbackCount:         cfg.fallbackCount,
      totalRequests:         agg.totalRequests,
      estimatedTokens:       hasReal ? agg.realInputTokens + agg.realOutputTokens : tokenEst.total,
      estimatedInputTokens:  hasReal ? agg.realInputTokens : tokenEst.input,
      estimatedOutputTokens: hasReal ? agg.realOutputTokens : tokenEst.output,
      estimatedUsd:          estimateRequestCostUsd(
        modelId,
        agg.totalRequests,
        agg.realInputTokens,
        agg.realOutputTokens,
        costMode,
      ),
      realInputTokens:       agg.realInputTokens,
      realOutputTokens:      agg.realOutputTokens,
      realTotalTokens:       agg.realInputTokens + agg.realOutputTokens,
      hasRealTokens:         hasReal,
      modelClass:            mc,
      lastUsedMonth:         agg.lastMonth,
      lastUsedAt:            agg.lastUpdatedAt ? new Date(agg.lastUpdatedAt).toISOString() : null,
      lastWidgetId:          topWidget?.widgetId ?? null,
      lastWidgetName:        topWidget?.widgetName ?? null,
      lastAgentUpdatedAt:    cfg.lastAgentUpdatedAt?.toISOString() ?? null,
      widgets:               sortedWidgets,
    });
  }

  // Sin filtros específicos: añadir modelos con 0 peticiones (sólo config de agente)
  const isFiltered = !!(filterWidget || filterAgent || filterUser || filterModel);
  if (!isFiltered) {
    for (const [modelId, cfg] of configMap) {
      if (seenModels.has(modelId)) continue;
      const mc = classifyModelTier(modelId);
      rows.push({
        modelId,
        primaryCount:          cfg.primaryCount,
        fallbackCount:         cfg.fallbackCount,
        totalRequests:         0,
        estimatedTokens:       0,
        estimatedInputTokens:  0,
        estimatedOutputTokens: 0,
        estimatedUsd:          0,
        realInputTokens:       0,
        realOutputTokens:      0,
        realTotalTokens:       0,
        hasRealTokens:         false,
        modelClass:            mc,
        lastUsedMonth:         null,
        lastUsedAt:            null,
        lastWidgetId:          null,
        lastWidgetName:        null,
        lastAgentUpdatedAt:    cfg.lastAgentUpdatedAt?.toISOString() ?? null,
        widgets:               [],
      });
    }
  }

  rows.sort((a, b) => {
    if (b.totalRequests !== a.totalRequests) return b.totalRequests - a.totalRequests;
    if (b.primaryCount  !== a.primaryCount)  return b.primaryCount  - a.primaryCount;
    return a.modelId.localeCompare(b.modelId);
  });

  return NextResponse.json({
    ok: true,
    models: rows,
    total: rows.length,
    filter: { from: fromMonth, to: toMonth, widgetId: filterWidget, agentId: filterAgent, userId: filterUser, model: filterModel },
    costing: {
      mode: costMode,
      invoiceBlendUsdPer1M: invoiceBlendUsdPer1M(),
      calibrationFactor:    costCalibrationFactor(),
    },
  });
}
