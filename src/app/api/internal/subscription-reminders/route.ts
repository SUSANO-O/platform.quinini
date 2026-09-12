import { NextRequest, NextResponse } from 'next/server';
import { runSubscriptionReminders } from '@/lib/subscription-reminders';
import { runLifecycleNotices, runAccountPurge, isAccountPurgeEnabled } from '@/modules/account-lifecycle/composition';

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

  // Avisos POSTERIORES al vencimiento: cortesía, suspensión y aviso semanal de
  // borrado. Van en el mismo tick diario para no sumar otro cron; un fallo acá
  // no debe tumbar los recordatorios previos, que ya se enviaron arriba.
  let lifecycle: Awaited<ReturnType<typeof runLifecycleNotices>> | { ok: false; error: string };
  try {
    lifecycle = await runLifecycleNotices({ dryRun: false });
  } catch (e) {
    console.error('[cron] runLifecycleNotices:', e);
    lifecycle = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Borrado de cuentas que agotaron el plazo. Mientras ACCOUNT_PURGE_ENABLED no
  // esté en 'true', esto SOLO reporta qué borraría — no toca ningún dato.
  let purge: Awaited<ReturnType<typeof runAccountPurge>> | { ok: false; error: string };
  try {
    purge = await runAccountPurge({ dryRun: !isAccountPurgeEnabled() });
  } catch (e) {
    console.error('[cron] runAccountPurge:', e);
    purge = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({ ...result, lifecycle, purge, source: 'cron' });
}
