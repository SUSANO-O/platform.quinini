/**
 * GET  /api/user/escalation-slack — configuración Slack al escalar
 * PUT  /api/user/escalation-slack — guardar Incoming Webhook URL
 * POST /api/user/escalation-slack — enviar mensaje de prueba
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription } from '@/lib/db/models';
import {
  isValidSlackIncomingWebhookUrl,
  normalizeSlackIncomingWebhookUrl,
  postSlackEscalationWebhook,
} from '@/lib/escalation-slack';
import {
  OUTBOUND_SAAS_WEBHOOK_MIN_PLAN,
  planRank,
  PLAN_DISPLAY,
  type PlanId,
} from '@/lib/plan-catalog';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

async function userPlan(userId: string): Promise<PlanId> {
  const sub = await Subscription.findOne({ userId }).select({ plan: 1, status: 1 }).lean() as
    | { plan?: string; status?: string }
    | null;
  const active = sub?.status === 'active' || sub?.status === 'trialing';
  return (active ? (sub?.plan ?? 'free') : 'free') as PlanId;
}

function planEligible(plan: PlanId): boolean {
  return planRank(plan) >= planRank(OUTBOUND_SAAS_WEBHOOK_MIN_PLAN);
}

function inboxUrl(req: NextRequest): string {
  const origin =
    req.headers.get('x-forwarded-host')
      ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}`
      : req.nextUrl.origin;
  return `${origin.replace(/\/$/, '')}/dashboard/inbox`;
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  const plan = await userPlan(userId);
  const u = await User.findById(userId).select({ escalationSlackWebhookUrl: 1 }).lean() as
    | { escalationSlackWebhookUrl?: string | null }
    | null;

  const url = typeof u?.escalationSlackWebhookUrl === 'string' ? u.escalationSlackWebhookUrl.trim() : '';
  const configured = Boolean(url && isValidSlackIncomingWebhookUrl(url));

  return NextResponse.json({
    planEligible: planEligible(plan),
    minPlanLabel: PLAN_DISPLAY[OUTBOUND_SAAS_WEBHOOK_MIN_PLAN]?.label ?? 'Starter',
    configured,
    webhookUrlPreview: configured ? `${url.slice(0, 40)}…${url.slice(-8)}` : null,
    hasExistingConfig: Boolean(url),
  });
}

export async function PUT(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  const plan = await userPlan(userId);
  if (!planEligible(plan)) {
    return NextResponse.json(
      {
        error: `Las notificaciones Slack requieren plan ${PLAN_DISPLAY[OUTBOUND_SAAS_WEBHOOK_MIN_PLAN]?.label ?? 'Starter'} o superior.`,
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({})) as {
    webhookUrl?: string;
    clear?: boolean;
  };

  if (body.clear === true) {
    await User.findByIdAndUpdate(userId, { $set: { escalationSlackWebhookUrl: null } });
    return NextResponse.json({ ok: true, cleared: true });
  }

  const url = normalizeSlackIncomingWebhookUrl(typeof body.webhookUrl === 'string' ? body.webhookUrl : '');
  if (!url) {
    await User.findByIdAndUpdate(userId, { $set: { escalationSlackWebhookUrl: null } });
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (!isValidSlackIncomingWebhookUrl(url)) {
    return NextResponse.json(
      {
        error: 'URL inválida. Debe ser un Incoming Webhook de Slack (https://hooks.slack.com/services/...).',
      },
      { status: 400 },
    );
  }

  await User.findByIdAndUpdate(userId, { $set: { escalationSlackWebhookUrl: url } });
  return NextResponse.json({ ok: true, configured: true });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  const plan = await userPlan(userId);
  if (!planEligible(plan)) {
    return NextResponse.json({ error: 'Plan insuficiente.' }, { status: 403 });
  }

  const u = await User.findById(userId).select({ escalationSlackWebhookUrl: 1 }).lean() as
    | { escalationSlackWebhookUrl?: string | null }
    | null;
  const url = typeof u?.escalationSlackWebhookUrl === 'string' ? u.escalationSlackWebhookUrl.trim() : '';
  if (!url || !isValidSlackIncomingWebhookUrl(url)) {
    return NextResponse.json({ error: 'Guarda primero una URL de Incoming Webhook válida.' }, { status: 400 });
  }

  const result = await postSlackEscalationWebhook(
    url,
    { userId, widgetId: 'test', widgetName: 'Prueba BotIvA', sessionId: 'test-session' },
    { test: true, inboxUrl: inboxUrl(req) },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || 'Slack rechazó el mensaje de prueba.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, message: 'Mensaje de prueba enviado a Slack.' });
}
