/**
 * GET    /api/widgets/[id] — un widget del usuario
 * PATCH  /api/widgets/[id] — actualizar configuración (no token ni userId)
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { Widget, Subscription } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { validateMultiAgentWidgetSave, validateMultiAgentMode, validatePipelineWidgetConfigSave } from '@/lib/widget-multi-agent';
import { invalidateWidgetTokenCache } from '@/lib/widget-token-verify';
import { normalizeHandoffNotifyMode, normalizeWidgetSupportFields } from '@/lib/handoff-notify';
import { isSoloChatOnlyPlan } from '@/lib/plan-catalog';
import { SOLO_WIDGET_LOCKED } from '@/lib/solo-plan-limits';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

const PATCHABLE = [
  'name',
  'agentId',
  'color',
  'title',
  'subtitle',
  'welcome',
  'fabHint',
  'avatar',
  'position',
  'theme',
  'borderRadius',
  'autoOpen',
  'voiceEnabled',
  'humanSupportPhone',
  'humanSupportEnabled',
  'handoffNotifyMode',
  'handoffEnabled',
  'active',
] as const;

type PatchableKey = (typeof PATCHABLE)[number];

interface WidgetShortcut {
  id: string;
  label: string;
  message: string;
  emoji?: string;
  enabled: boolean;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(_req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  await connectDB();
  const widget = await Widget.findOne({ _id: id, userId }).lean();
  if (!widget) return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });

  return NextResponse.json({ widget: normalizeWidgetSupportFields(widget as Record<string, unknown>) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const $set: Partial<Record<PatchableKey, unknown>> & {
    shortcuts?: WidgetShortcut[];
    multiAgentEnabled?: boolean;
    multiAgentMode?: 'triage' | 'parallel' | 'pipeline';
    agentIds?: string[];
    orchestratorAgentIds?: string[];
    pipelineConfig?: unknown;
  } = {};

  for (const key of PATCHABLE) {
    if (!(key in raw)) continue;
    const v = raw[key];
    if (key === 'autoOpen' || key === 'voiceEnabled' || key === 'active' || key === 'handoffEnabled' || key === 'humanSupportEnabled') {
      $set[key] = Boolean(v);
      continue;
    }
    if (key === 'theme') {
      if (v === 'light' || v === 'dark') $set.theme = v;
      continue;
    }
    if (key === 'handoffNotifyMode') {
      if (typeof v === 'string') $set.handoffNotifyMode = normalizeHandoffNotifyMode(v);
      continue;
    }
    if (typeof v === 'string') {
      if (key === 'name' || key === 'agentId') {
        const s = v.trim();
        if (!s) return NextResponse.json({ error: `${key} no puede estar vacío.` }, { status: 400 });
        $set[key] = s;
      } else if (key === 'humanSupportPhone') {
        $set.humanSupportPhone = v.trim().slice(0, 48);
      } else {
        $set[key] = v;
      }
    }
  }

  // Handle shortcuts array separately
  if ('shortcuts' in raw && Array.isArray(raw.shortcuts)) {
    $set.shortcuts = (raw.shortcuts as WidgetShortcut[])
      .filter((s) => s && typeof s.id === 'string' && typeof s.label === 'string' && typeof s.message === 'string')
      .slice(0, 20)
      .map((s) => ({
        id: String(s.id).slice(0, 64),
        label: String(s.label).slice(0, 40),
        message: String(s.message).slice(0, 500),
        emoji: typeof s.emoji === 'string' ? s.emoji.slice(0, 8) : '',
        enabled: s.enabled !== false,
      }));
  }

  if (
    Object.keys($set).length === 0 &&
    !('multiAgentEnabled' in raw) &&
    !('agentIds' in raw) &&
    !('multiAgentMode' in raw) &&
    !('orchestratorAgentIds' in raw) &&
    !('pipelineConfig' in raw)
  ) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  await connectDB();

  const existing = await Widget.findOne({ _id: id, userId }).lean() as {
    agentId?: string;
    multiAgentEnabled?: boolean;
    multiAgentMode?: string;
    agentIds?: string[];
    orchestratorAgentIds?: string[];
    pipelineConfig?: unknown;
  } | null;
  if (!existing) {
    return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
  }

  const subPlan = await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1 })
    .lean() as { plan?: string; status?: string } | null;
  const planActive = subPlan?.status === 'active' || subPlan?.status === 'trialing';
  const userPlan = planActive ? (subPlan?.plan ?? 'free') : 'free';

  const orchestratorAgentId =
    typeof $set.agentId === 'string' ? $set.agentId : String(existing.agentId ?? '');

  if ('multiAgentEnabled' in raw || 'agentIds' in raw || 'multiAgentMode' in raw || 'orchestratorAgentIds' in raw || 'pipelineConfig' in raw) {
    const sub = await Subscription.findOne({ userId })
      .select({ plan: 1, status: 1 })
      .lean() as { plan?: string; status?: string } | null;
    const active = sub?.status === 'active' || sub?.status === 'trialing';
    const plan = active ? (sub?.plan ?? 'free') : 'free';
    const multiEnabled =
      'multiAgentEnabled' in raw ? raw.multiAgentEnabled === true : existing.multiAgentEnabled === true;
    const agentIdsInput = 'agentIds' in raw ? raw.agentIds : existing.agentIds;
    const orchIdsInput =
      'orchestratorAgentIds' in raw ? raw.orchestratorAgentIds : existing.orchestratorAgentIds;
    const modeInput =
      'multiAgentMode' in raw ? validateMultiAgentMode(raw.multiAgentMode) : validateMultiAgentMode(existing.multiAgentMode);
    const validation = await validateMultiAgentWidgetSave({
      userId,
      plan,
      orchestratorAgentId,
      multiAgentEnabled: multiEnabled,
      agentIds: agentIdsInput,
      orchestratorAgentIds: orchIdsInput,
    });
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, code: validation.code },
        { status: 403 },
      );
    }
    const resolvedMode = multiEnabled ? modeInput : 'triage';
    const resolvedOrchIds = validation.orchestratorAgentIds;
    const pipelineInput =
      'pipelineConfig' in raw ? raw.pipelineConfig : existing.pipelineConfig;
    const pipelineValidation = await validatePipelineWidgetConfigSave({
      userId,
      plan,
      multiAgentEnabled: multiEnabled,
      multiAgentMode: resolvedMode,
      orchestratorAgentId,
      orchestratorAgentIds: resolvedOrchIds,
      pipelineConfig: pipelineInput,
    });
    if (!pipelineValidation.ok) {
      return NextResponse.json(
        { error: pipelineValidation.error, code: pipelineValidation.code },
        { status: 403 },
      );
    }
    $set.multiAgentEnabled = multiEnabled;
    $set.multiAgentMode = resolvedMode;
    $set.agentIds = validation.agentIds;
    $set.orchestratorAgentIds = resolvedOrchIds;
    $set.pipelineConfig = pipelineValidation.pipelineConfig;
  }

  if (isSoloChatOnlyPlan(userPlan)) {
    Object.assign($set, SOLO_WIDGET_LOCKED);
    const agentId =
      typeof $set.agentId === 'string'
        ? $set.agentId
        : String(existing.agentId ?? '');
    if (agentId) $set.agentIds = [agentId];
  }

  if (Object.keys($set).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  const res = await Widget.updateOne({ _id: id, userId }, { $set });
  if (res.matchedCount === 0) {
    return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
  }

  const widget = await Widget.findOne({ _id: id, userId }).lean() as {
    afhubToken?: string;
  } | null;
  if (widget?.afhubToken) {
    await invalidateWidgetTokenCache(String(widget.afhubToken), id);
  }
  return NextResponse.json({
    widget: widget
      ? normalizeWidgetSupportFields(widget as Record<string, unknown>)
      : null,
  });
}
