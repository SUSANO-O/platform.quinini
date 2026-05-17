/**
 * GET /api/internal/history-cleanup
 * Elimina sesiones de conversación más antiguas que el límite de retención del plan.
 * Protegido por CRON_SECRET. Diseñado para ejecutarse diariamente.
 *
 * Headers: x-cron-secret: <CRON_SECRET>  o  Authorization: Bearer <CRON_SECRET>
 * Query:   ?dryRun=true  para simular sin borrar
 */

import { NextRequest, NextResponse } from 'next/server';
import { runHistoryCleanup } from '@/lib/history-cleanup';

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

  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';

  const result = await runHistoryCleanup({ dryRun });

  return NextResponse.json({ ...result, source: 'cron' });
}
