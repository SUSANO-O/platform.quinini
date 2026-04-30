/**
 * GET/PATCH /api/user/saas-webhook — configuración webhook saliente (firma HMAC).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, generateSecureToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { recordAudit } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();
  const u = await User.findById(userId).select({ saasWebhookUrl: 1, saasWebhookSecret: 1 }).lean() as
    | { saasWebhookUrl?: string | null; saasWebhookSecret?: string | null }
    | null;

  const url = u?.saasWebhookUrl?.trim() || '';
  const hasSecret = Boolean(u?.saasWebhookSecret && String(u.saasWebhookSecret).length > 0);

  return NextResponse.json({
    configured: Boolean(url),
    url: url || null,
    secretPreview: hasSecret ? '••••••••' + String(u!.saasWebhookSecret).slice(-4) : null,
  });
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

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

  await connectDB();
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
    url: u2?.saasWebhookUrl || null,
    secretPreview: hasSecret ? '••••••••' + String(u2!.saasWebhookSecret).slice(-4) : null,
    /** Solo devuelto una vez al rotar secreto */
    secretPlain: body.regenerateSecret === true ? u2?.saasWebhookSecret ?? null : undefined,
  });
}
