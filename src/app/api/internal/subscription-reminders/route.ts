import { NextRequest, NextResponse } from 'next/server';
import { runSubscriptionReminders } from '@/lib/subscription-reminders';
import { runSuspensionNotices } from '@/lib/subscription-suspension';

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
    plans: ['free', 'solo', 'team', 'plus', 'business', 'enterprise'],
    limit: 5000,
  });

  // Avisos POSTERIORES al vencimiento (cortesía y suspensión). Van en el mismo
  // tick diario para no sumar otro cron; un fallo acá no debe tumbar los
  // recordatorios previos, que ya se enviaron arriba.
  let suspension: Awaited<ReturnType<typeof runSuspensionNotices>> | { ok: false; error: string };
  try {
    suspension = await runSuspensionNotices({ dryRun: false, limit: 5000 });
  } catch (e) {
    console.error('[cron] runSuspensionNotices:', e);
    suspension = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({ ...result, suspension, source: 'cron' });
}
