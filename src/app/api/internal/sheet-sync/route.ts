/**
 * GET /api/internal/sheet-sync
 * Sync nocturno Sheets → Mongo (3 AM America/Bogota = 08:00 UTC).
 * Headers: x-cron-secret o Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSheetNightlySync } from '@/lib/sheet-sync';

function getSecret(req: NextRequest): string | null {
  return (
    req.headers.get('x-cron-secret')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    null
  );
}

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado.' }, { status: 503 });
  }

  const got = getSecret(req);
  if (!got || got !== expected) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
  const result = await runSheetNightlySync({ dryRun });

  return NextResponse.json({ ...result, source: 'cron', schedule: '0 8 * * * UTC (3 AM Bogotá)' });
}
