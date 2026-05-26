import { NextRequest, NextResponse } from 'next/server';
import { processDueInboxFollowUps } from '@/lib/inbox-follow-ups';

function getSecret(req: NextRequest): string | null {
  return (
    req.headers.get('x-cron-secret')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    null
  );
}

/** GET /api/internal/inbox-follow-ups — marca follow-ups vencidos (cron). */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado.' }, { status: 503 });
  }

  const got = getSecret(req);
  if (!got || got !== expected) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';
  const result = await processDueInboxFollowUps({ dryRun });
  return NextResponse.json({ ...result, dryRun, source: 'cron' });
}
