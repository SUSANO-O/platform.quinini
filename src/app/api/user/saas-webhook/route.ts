/**
 * GET/PATCH /api/user/saas-webhook — configuración webhook saliente (firma HMAC).
 * Requiere plan Starter+ (active/trialing/past_due).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, generateSecureToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription } from '@/lib/db/models';
import { recordAudit } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limit';
import {
  canUseOutboundSaasWebhook,
  outboundWebhookUpgradeLabel,
  OUTBOUND_SAAS_WEBHOOK_MIN_PLAN,
} from '@/lib/plan-catalog';

async function loadSubscription(userId: string) {
  await connectDB();
  return Subscription.findOne({ userId }).select({ plan: 1, status: 1, features: 1 }).lean() as Promise<
    { plan?: string; status?: string; features?: string[] } | null
  >;
}

function upgradePayload() {
  return {
    code: 'OUTBOUND_WEBHOOK_REQUIRES_STARTER',
    minPlan: OUTBOUND_SAAS_WEBHOOK_MIN_PLAN,
    minPlanLabel: outboundWebhookUpgradeLabel(),
    error: `El webhook saliente está disponible desde el plan ${outboundWebhookUpgradeLabel()}.`,
  };
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const sub = await loadSubscription(userId);
  const plan = sub?.plan ?? 'free';
  const status = sub?.status ?? 'free';
  const allowed = canUseOutboundSaasWebhook(plan, status, sub?.features);

  const u = await User.findById(userId).select({ saasWebhookUrl: 1, saasWebhookSecret: 1 }).lean() as
    | { saasWebhookUrl?: string | null; saasWebhookSecret?: string | null }
    | null;

  const url = u?.saasWebhookUrl?.trim() || '';
  const hasSecret = Boolean(u?.saasWebhookSecret && String(u.saasWebhookSecret).length > 0);

  return NextResponse.json({
    allowed,
    minPlan: OUTBOUND_SAAS_WEBHOOK_MIN_PLAN,
    minPlanLabel: outboundWebhookUpgradeLabel(),
    configured: Boolean(url),
    url: allowed ? (url || null) : null,
    secretPreview: allowed && hasSecret ? '••••••••' + String(u!.saasWebhookSecret).slice(-4) : null,
    hasExistingConfig: Boolean(url),
  });
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const sub = await loadSubscription(userId);
  const plan = sub?.plan ?? 'free';
  const status = sub?.status ?? 'free';
  if (!canUseOutboundSaasWebhook(plan, status, sub?.features)) {
    return NextResponse.json(upgradePayload(), { status: 403 });
  }

  let body: { url?: string | null; regenerateSecret?: boolean };
  try {
    body = (await req.json()) as { url?: string | null; regenerateSecret?: boolean };
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const urlRaw = body.url === null || body.url === '' ? '' : String(body.url).trim();
  if (urlRaw && !urlRaw.startsWith('https://')) {
    return NextResponse.json({ error: 'La URL debe usar HTTPS.' }, { status: 400 });
  }

  const existing = await User.findById(userId).select({ saasWebhookUrl: 1, saasWebhookSecret: 1 }).lean() as {
    saasWebhookUrl?: string | null;
    saasWebhookSecret?: string | null;
  } | null;

  const update: { saasWebhookUrl?: string | null; saasWebhookSecret?: string | null } = {};

  if ('url' in body) {
    update.saasWebhookUrl = urlRaw || null;
    if (!urlRaw) {
      update.saasWebhookSecret = null;
    }
  }

  if (body.regenerateSecret === true) {
    update.saasWebhookSecret = generateSecureToken();
  } else if (urlRaw && (!existing?.saasWebhookSecret || String(existing.saasWebhookSecret).length === 0)) {
    /** Primera vez que se configura URL: generamos secreto para firma HMAC */
    update.saasWebhookSecret = generateSecureToken();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Sin cambios.' }, { status: 400 });
  }

  await User.updateOne({ _id: userId }, { $set: update });

  await recordAudit({
    userId,
    action: 'saas_webhook.updated',
    resource: 'saas_webhook',
    meta: { urlSet: Boolean(urlRaw), secretRotated: body.regenerateSecret === true },
    ip: getClientIp(req),
  });

  const u2 = await User.findById(userId).select({ saasWebhookUrl: 1, saasWebhookSecret: 1 }).lean() as {
    saasWebhookUrl?: string | null;
    saasWebhookSecret?: string | null;
  } | null;

  const hasSecret = Boolean(u2?.saasWebhookSecret && String(u2.saasWebhookSecret).length > 0);

  return NextResponse.json({
    ok: true,
    allowed: true,
    url: u2?.saasWebhookUrl || null,
    secretPreview: hasSecret ? '••••••••' + String(u2!.saasWebhookSecret).slice(-4) : null,
    /** Solo devuelto una vez al rotar secreto */
    secretPlain: body.regenerateSecret === true ? u2?.saasWebhookSecret ?? null : undefined,
  });
}
