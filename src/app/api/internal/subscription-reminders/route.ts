import { NextRequest, NextResponse } from 'next/server';
import { runSubscriptionReminders } from '@/lib/subscription-reminders';

function getSecret(req: NextRequest): string | null {
  return (
    req.headers.get('x-cron-secret')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    null
  );
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET no configurado.' }, { status: 503 });

  const got = getSecret(req);
  if (!got || got !== expected) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const result = await runSubscriptionReminders({
    dryRun: false,
    kinds: ['trial', 'renewal'],
    plans: ['free', 'starter', 'growth', 'business', 'enterprise'],
    limit: 5000,
  });

  return NextResponse.json({ ...result, source: 'cron' });
}
