/**
 * POST /api/billing/sync-checkout  { transactionId: 'txn_...' }
 * Fallback cuando el webhook de Paddle aún no actualizó MongoDB o falló la firma.
 * Obtiene la transacción por API (misma API key) y aplica el mismo efecto que transaction.completed.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Subscription as SubscriptionModel } from '@/lib/db/models';
import { paddle } from '@/lib/paddle';
import { verifySessionToken } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { syncSubscriptionFromPaddle } from '@/lib/subscription';

function isoToEpoch(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

function readCustomString(data: object | null, key: string): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const v = (data as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit('billing-sync-checkout', ip, 30, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  if (!process.env.PADDLE_API_KEY) {
    return NextResponse.json({ error: 'Paddle no configurado.' }, { status: 500 });
  }

  let transactionId = '';
  try {
    const body = (await req.json()) as { transactionId?: string };
    transactionId = typeof body?.transactionId === 'string' ? body.transactionId.trim() : '';
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (!transactionId.startsWith('txn_')) {
    return NextResponse.json({ error: 'transactionId inválido.' }, { status: 400 });
  }

  try {
    const txn = await paddle.transactions.get(transactionId);

    if (txn.status !== 'completed') {
      return NextResponse.json(
        { ok: false, status: txn.status, message: `Transacción en estado ${txn.status}.` },
        { status: 409 },
      );
    }

    const custom = txn.customData as Record<string, unknown> | null;
    const ownerId = readCustomString(custom, 'userId');
    if (!ownerId || ownerId !== userId) {
      return NextResponse.json(
        { error: 'Esta transacción no corresponde a tu cuenta.' },
        { status: 403 },
      );
    }

    const packType = readCustomString(custom, 'type');
    if (packType === 'conversation_pack') {
      return NextResponse.json({
        ok: true,
        skipped: true,
        message: 'Transacción de pack; no aplica suscripción.',
      });
    }

    const subscriptionId = txn.subscriptionId;
    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'La transacción no tiene suscripción asociada.' },
        { status: 400 },
      );
    }

    const rawPlan = readCustomString(custom, 'plan') ?? 'starter';
    const plan = ['starter', 'growth', 'business'].includes(rawPlan) ? rawPlan : 'starter';

    const periodEnd = isoToEpoch(txn.billingPeriod?.endsAt);
    const periodStart = isoToEpoch(txn.billingPeriod?.startsAt);

    await connectDB();

    await SubscriptionModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          paddleCustomerId: txn.customerId ?? null,
          paddleSubscriptionId: subscriptionId,
          status: 'active',
          plan,
          currentPeriodEnd: periodEnd,
          currentPeriodStart: periodStart,
          cancelAtPeriodEnd: false,
        },
      },
      { upsert: true, new: true },
    );

    await syncSubscriptionFromPaddle(userId);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] sync-checkout:', msg);
    return NextResponse.json({ error: 'No se pudo sincronizar el pago.' }, { status: 502 });
  }
}
