/**
 * POST /api/mcp/data-sources/test
 * Comprueba conectividad a MongoDB o PostgreSQL con credenciales efímeras (no se guardan).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  testMongodbConnectionString,
  testPostgresConnectionString,
} from '@/lib/mcp-data-source-connection-test';
import { getSessionUserId } from '@/lib/mcp-landing-auth';

const ALLOWED = new Set(['mongodb', 'postgres']);

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const rl = checkRateLimit('mcp-ds-test', userId, 20, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Demasiadas pruebas de conexión. Espera un minuto.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    integrationKey?: string;
    credentials?: Record<string, string>;
  };

  const integrationKey = String(body.integrationKey ?? '').trim();
  if (!ALLOWED.has(integrationKey)) {
    return NextResponse.json({ error: 'integrationKey debe ser mongodb o postgres.' }, { status: 400 });
  }

  const uri = String(body.credentials?.connectionUri ?? '').trim();
  if (!uri) {
    return NextResponse.json({ error: 'Falta credentials.connectionUri.' }, { status: 400 });
  }

  const result =
    integrationKey === 'mongodb'
      ? await testMongodbConnectionString(uri)
      : await testPostgresConnectionString(uri);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true, detail: result.detail });
}
