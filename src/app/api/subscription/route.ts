/**
 * GET /api/subscription?userId=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSubscriptionStatus } from '@/lib/subscription';
import { verifySessionToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  // Prefer cookie auth, fall back to query param
  const token = req.cookies.get('afhub_session')?.value;
  let userId = req.nextUrl.searchParams.get('userId') || '';

  if (token) {
    const fromToken = verifySessionToken(token);
    if (fromToken) userId = fromToken;
  }

  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  try {
    const status = await getSubscriptionStatus(userId);
    return NextResponse.json(status);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Subscription] Error:', msg);
    return NextResponse.json({ error: 'Error al obtener suscripción.' }, { status: 500 });
  }
}
