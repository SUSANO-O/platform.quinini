/**
 * GET  /api/widgets          — list user's widgets
 * POST /api/widgets          — create widget (unique name per user, no plan limit)
 * DELETE /api/widgets?id=xxx — delete widget
 */

import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget, ClientAgent, User, Subscription } from '@/lib/db/models';
import { verifySessionToken, isUserEmailVerified, isImpersonationSession } from '@/lib/auth';
import { validateMultiAgentWidgetSave, validateMultiAgentMode, validatePipelineWidgetConfigSave } from '@/lib/widget-multi-agent';
import { normalizeHandoffNotifyMode, normalizeWidgetSupportFields } from '@/lib/handoff-notify';
import { applySoloWidgetDefaults } from '@/lib/solo-plan-limits';
import { normalizeAiBeamFields } from '@/lib/widget-ai-beam';
import { normalizeScrollHaloFields } from '@/lib/widget-scroll-halo';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  const widgets = await Widget.find({ userId }).sort({ createdAt: -1 }).lean();
  const agentIds = [...new Set(widgets.map((w) => w.agentId).filter(Boolean) as string[])];
  const nameByAgentId = new Map<string, string>();
  if (agentIds.length) {
    const agents = await ClientAgent.find({ _id: { $in: agentIds } })
      .select('_id name userId isPlatform')
      .lean();
    for (const a of agents) {
      const owner = String(a.userId) === String(userId);
      const platform = (a as { isPlatform?: boolean }).isPlatform === true;
      if (!owner && !platform) continue;
      nameByAgentId.set(String(a._id), typeof a.name === 'string' ? a.name : '');
    }
  }
  const widgetsOut = widgets.map((w) =>
    normalizeWidgetSupportFields({
      ...w,
      agentName: nameByAgentId.get(String(w.agentId)) ?? null,
      multiAgentEnabled: (w as { multiAgentEnabled?: boolean }).multiAgentEnabled === true,
      multiAgentMode: validateMultiAgentMode((w as { multiAgentMode?: string }).multiAgentMode),
    } as Record<string, unknown>),
  );
  return NextResponse.json({ widgets: widgetsOut });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();

  // ── Check email verified ──────────────────────────────────────────────────
  const user = await User.findById(userId).select({ emailVerified: 1 }).lean() as { emailVerified?: boolean } | null;
  if (!isImpersonationSession(req.cookies) && !isUserEmailVerified(user)) {
    return NextResponse.json(
      { error: 'Debes verificar tu correo electrónico antes de crear widgets.', code: 'EMAIL_NOT_VERIFIED' },
      { status: 403 },
    );
  }

  const body = await req.json() as Record<string, unknown>;

  // ── Unicidad: no dos widgets con el mismo nombre (case-insensitive) ───────
  const nameStr = typeof body.name === 'string' ? body.name.trim() : '';
  if (!nameStr) {
    return NextResponse.json({ error: 'El nombre del widget es requerido.' }, { status: 400 });
  }
  const escaped = nameStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = await Widget.findOne({
    userId,
    name: { $regex: `^${escaped}$`, $options: 'i' },
  })
    .select({ _id: 1, name: 1 })
    .lean() as { _id: unknown; name: string } | null;
  if (existing) {
    return NextResponse.json(
      {
        error: `Ya tienes un widget llamado "${existing.name}". Usa un nombre diferente para crear uno nuevo.`,
        code: 'WIDGET_NAME_TAKEN',
        existingWidgetId: String(existing._id),
        existingWidgetName: existing.name,
      },
      { status: 409 },
    );
  }
  const afhubToken =
    typeof body.afhubToken === 'string' && body.afhubToken.trim().startsWith('wt_')
      ? body.afhubToken.trim()
      : `wt_${randomBytes(24).toString('hex')}`;

  const { afhubToken: _ignoredToken, userId: _ignoredUid, name: _ignoredName, ...rest } = body;

  const orchestratorAgentId =
    typeof rest.agentId === 'string' ? rest.agentId.trim() : '';
  if (!orchestratorAgentId) {
    return NextResponse.json({ error: 'agentId es requerido.' }, { status: 400 });
  }

  const sub = await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1 })
    .lean() as { plan?: string; status?: string } | null;
  const active = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = active ? (sub?.plan ?? 'free') : 'free';
  const restNormalized = applySoloWidgetDefaults(plan, rest as Record<string, unknown>);
  const multiMode = validateMultiAgentMode(restNormalized.multiAgentMode);
  const multiValidation = await validateMultiAgentWidgetSave({
    userId,
    plan,
    orchestratorAgentId,
    multiAgentEnabled: restNormalized.multiAgentEnabled === true,
    agentIds: restNormalized.agentIds,
    orchestratorAgentIds: restNormalized.orchestratorAgentIds,
  });
  if (!multiValidation.ok) {
    return NextResponse.json(
      { error: multiValidation.error, code: multiValidation.code },
      { status: 403 },
    );
  }

  const multiEnabled = restNormalized.multiAgentEnabled === true;
  const resolvedMode = multiEnabled ? multiMode : 'triage';
  const pipelineValidation = await validatePipelineWidgetConfigSave({
    userId,
    plan,
    multiAgentEnabled: multiEnabled,
    multiAgentMode: resolvedMode,
    orchestratorAgentId,
    orchestratorAgentIds: multiValidation.orchestratorAgentIds,
    pipelineConfig: restNormalized.pipelineConfig,
  });
  if (!pipelineValidation.ok) {
    return NextResponse.json(
      { error: pipelineValidation.error, code: pipelineValidation.code },
      { status: 403 },
    );
  }

  const widget = await Widget.create({
    ...restNormalized,
    ...normalizeAiBeamFields(restNormalized as Record<string, unknown>),
    ...normalizeScrollHaloFields(restNormalized as Record<string, unknown>),
    name: nameStr,
    userId,
    afhubToken,
    handoffNotifyMode: normalizeHandoffNotifyMode(
      typeof restNormalized.handoffNotifyMode === 'string' ? restNormalized.handoffNotifyMode : 'inbox',
    ),
    fabDismissible: restNormalized.fabDismissible !== false,
    handoffEnabled: restNormalized.handoffEnabled === true,
    humanSupportEnabled: restNormalized.humanSupportEnabled === true,
    multiAgentEnabled: multiEnabled,
    multiAgentMode: resolvedMode,
    agentIds: multiValidation.agentIds,
    orchestratorAgentIds: multiValidation.orchestratorAgentIds,
    pipelineConfig: pipelineValidation.pipelineConfig,
  });
  return NextResponse.json({ widget: normalizeWidgetSupportFields(widget as Record<string, unknown>) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido.' }, { status: 400 });

  await connectDB();
  await Widget.deleteOne({ _id: id, userId });
  return NextResponse.json({ ok: true });
}
