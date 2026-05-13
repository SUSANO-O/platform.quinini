/**
 * POST /api/notifications/push-subscribe
 * Guarda la suscripción push del navegador para enviar notificaciones
 * cuando la cuota llega al 80% o hay nuevos FAQ candidates.
 *
 * Require: npm install web-push
 * .env:
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_EMAIL=mailto:admin@yourdomain.com
 * Generar con: npx web-push generate-vapid-keys
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function POST(req: NextRequest) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json() as { subscription?: object; action?: string };

  await connectDB();

  if (body.action === 'unsubscribe') {
    await User.updateOne({ _id: userId }, { $unset: { pushSubscription: 1 } });
    return NextResponse.json({ ok: true, action: 'unsubscribed' });
  }

  if (!body.subscription) {
    return NextResponse.json({ error: 'subscription requerida.' }, { status: 400 });
  }

  await User.updateOne(
    { _id: userId },
    { $set: { pushSubscription: body.subscription } },
  );

  return NextResponse.json({ ok: true, action: 'subscribed' });
}

export async function GET(_req: NextRequest) {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
  return NextResponse.json({ vapidPublicKey, enabled: Boolean(vapidPublicKey) });
}
