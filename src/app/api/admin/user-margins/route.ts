/**
 * GET /api/admin/user-margins?from=YYYY-MM&to=YYYY-MM&plan=business
 *
 * Solo admin. Calcula margen bruto por usuario:
 *   margen = precio_plan_mensual - coste_LLM_real_estimado
 *
 * El coste LLM se calcula igual que /api/admin/model-stats en modo 'realistic'
 * (max entre tarifa API y blend factura GCP, × calibración).
 *
 * Devuelve usuarios ordenados por margen ascendente (los peores primero — los
 * que están perdiendo dinero o cerca aparecen arriba para que el admin actúe).
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription, RequestLog, ClientAgent } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { estimateRequestCostUsd } from '@/lib/llm-cost';
import {
  PLAN_DISPLAY,
  PLAN_CONVERSATION_LIMITS,
} from '@/lib/plan-catalog';

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

export interface UserMarginRow {
  userId: string;
  email: string;
  displayName: string;
  plan: string;
  planLabel: string;
  status: string;
  // Período
  monthsCovered: number;
  // Uso
  conversations: number;
  conversationsLimit: number;            // -1 = ilimitado
  utilizationPct: number;                // 0-100, NaN si ilimitado
  totalTokens: number;
  // Costos & margen
  llmCostUsd: number;                    // costo total del período
  monthlyPriceUsd: number;               // precio plan mensual
  periodPriceUsd: number;                // monthlyPriceUsd * monthsCovered
  marginUsd: number;                     // periodPriceUsd - llmCostUsd
  marginPct: number;                     // marginUsd / periodPriceUsd * 100 — NaN si plan gratis
  // Flags
  risk: 'ok' | 'thin' | 'loss' | 'free' | 'enterprise';
}

function classifyRisk(marginUsd: number, periodPriceUsd: number, plan: string): UserMarginRow['risk'] {
  if (plan === 'free') return 'free';
  if (plan === 'enterprise') return 'enterprise';
  if (periodPriceUsd <= 0) return 'free';
  if (marginUsd < 0) return 'loss';
  const pct = (marginUsd / periodPriceUsd) * 100;
  if (pct < 20) return 'thin';
  return 'ok';
}

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const url = new URL(req.url);
  const fromMonth = url.searchParams.get('from')?.trim() || currentMonth();
  const toMonth   = url.searchParams.get('to')?.trim()   || currentMonth();
  const filterPlan = url.searchParams.get('plan')?.trim() || '';

  // 1) Lista de meses del período (inclusive)
  const months = monthRange(fromMonth, toMonth);
  if (months.length === 0) {
    return NextResponse.json({ error: 'Rango from/to inválido.' }, { status: 400 });
  }

  // 2) Suscripciones activas (con filtro opcional por plan)
  const subFilter: Record<string, unknown> = {
    status: { $in: ['active', 'trialing', 'past_due'] },
  };
  if (filterPlan) subFilter.plan = filterPlan;

  const subs = await Subscription.find(subFilter)
    .select({ userId: 1, plan: 1, status: 1 })
    .lean() as Array<{ userId: string; plan: string; status: string }>;

  if (subs.length === 0) {
    return NextResponse.json({ ok: true, period: { from: fromMonth, to: toMonth, months }, rows: [] });
  }

  const userIds = subs.map((s) => s.userId);

  // 3) Aggregation: RequestLog por usuario (en el período)
  const usageAgg = await RequestLog.aggregate([
    { $match: { userId: { $in: userIds }, month: { $in: months } } },
    {
      $group: {
        _id: '$userId',
        conversations: { $sum: '$count' },
        inputTokens:   { $sum: '$inputTokens' },
        outputTokens:  { $sum: '$outputTokens' },
      },
    },
  ]);
  const usageByUser = new Map<string, { conversations: number; inputTokens: number; outputTokens: number }>();
  for (const u of usageAgg) {
    usageByUser.set(String(u._id), {
      conversations: u.conversations ?? 0,
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
    });
  }

  // 4) Datos de usuario (email + nombre)
  const users = await User.find({ _id: { $in: userIds } })
    .select({ email: 1, displayName: 1 })
    .lean() as Array<{ _id: { toString(): string }; email: string; displayName?: string }>;
  const userById = new Map<string, { email: string; displayName: string }>();
  for (const u of users) {
    userById.set(u._id.toString(), { email: u.email, displayName: u.displayName || '' });
  }

  // 5) Modelo principal por usuario — para mejor estimación de costo cuando faltan tokens reales
  const agentsAgg = await ClientAgent.aggregate([
    { $match: { userId: { $in: userIds } } },
    { $group: { _id: { userId: '$userId', model: '$model' }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $group: { _id: '$_id.userId', primaryModel: { $first: '$_id.model' } } },
  ]);
  const modelByUser = new Map<string, string>();
  for (const a of agentsAgg) {
    modelByUser.set(String(a._id), String(a.primaryModel || 'gemini-2.5-flash'));
  }

  // 6) Construir filas
  const monthsCovered = months.length;
  const rows: UserMarginRow[] = subs.map((sub) => {
    const user = userById.get(sub.userId) || { email: '(desconocido)', displayName: '' };
    const usage = usageByUser.get(sub.userId) || { conversations: 0, inputTokens: 0, outputTokens: 0 };
    const primaryModel = modelByUser.get(sub.userId) || 'gemini-2.5-flash';

    const monthlyPriceUsd = PLAN_DISPLAY[sub.plan]?.priceUsd ?? 0;
    const periodPriceUsd = monthlyPriceUsd < 0 ? 0 : monthlyPriceUsd * monthsCovered;

    const llmCostUsd = estimateRequestCostUsd(
      primaryModel,
      usage.conversations,
      usage.inputTokens,
      usage.outputTokens,
      'realistic',
    );

    const conversationsLimit = PLAN_CONVERSATION_LIMITS[sub.plan] ?? -1;
    const utilizationPct = conversationsLimit > 0
      ? Math.round((usage.conversations / (conversationsLimit * monthsCovered)) * 1000) / 10
      : 0;

    const marginUsd = periodPriceUsd - llmCostUsd;
    const marginPct = periodPriceUsd > 0
      ? Math.round((marginUsd / periodPriceUsd) * 1000) / 10
      : 0;

    const planLabel = PLAN_DISPLAY[sub.plan]?.label ?? sub.plan;

    return {
      userId: sub.userId,
      email: user.email,
      displayName: user.displayName,
      plan: sub.plan,
      planLabel,
      status: sub.status,
      monthsCovered,
      conversations: usage.conversations,
      conversationsLimit,
      utilizationPct,
      totalTokens: usage.inputTokens + usage.outputTokens,
      llmCostUsd,
      monthlyPriceUsd,
      periodPriceUsd,
      marginUsd,
      marginPct,
      risk: classifyRisk(marginUsd, periodPriceUsd, sub.plan),
    };
  });

  // Orden: pérdida primero, luego thin, luego ok. Dentro de cada bucket, menor margen $ primero.
  const riskRank: Record<UserMarginRow['risk'], number> = { loss: 0, thin: 1, ok: 2, free: 3, enterprise: 4 };
  rows.sort((a, b) => {
    const r = riskRank[a.risk] - riskRank[b.risk];
    if (r !== 0) return r;
    return a.marginUsd - b.marginUsd;
  });

  // Resumen
  const summary = {
    totalUsers: rows.length,
    losing: rows.filter((r) => r.risk === 'loss').length,
    thin: rows.filter((r) => r.risk === 'thin').length,
    ok: rows.filter((r) => r.risk === 'ok').length,
    totalRevenue: rows.reduce((s, r) => s + r.periodPriceUsd, 0),
    totalCost: rows.reduce((s, r) => s + r.llmCostUsd, 0),
    totalMargin: rows.reduce((s, r) => s + r.marginUsd, 0),
  };

  return NextResponse.json({
    ok: true,
    period: { from: fromMonth, to: toMonth, months, monthsCovered },
    summary,
    rows,
  });
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(from: string, to: string): string[] {
  const reMatch = /^\d{4}-\d{2}$/;
  if (!reMatch.test(from) || !reMatch.test(to)) return [];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if (!fy || !fm || !ty || !tm) return [];
  let y = fy, m = fm;
  const months: string[] = [];
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
    if (months.length > 36) break; // tope defensivo
  }
  return months;
}
