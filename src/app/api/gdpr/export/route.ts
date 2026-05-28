/**
 * GET  /api/gdpr/export          — descarga JSON plano (legacy)
 * POST /api/gdpr/export { password } — descarga HTML autocontenido encriptado AES-256-GCM
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { buildPersonalDataExport } from '@/lib/gdpr-pack';
import { recordAudit } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limit';
import { buildEncryptedHtml } from '@/lib/encrypt-export';

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  try {
    await connectDB();
    const payload = await buildPersonalDataExport(userId);
    await recordAudit({ userId, action: 'gdpr.export', resource: 'account', ip: getClientIp(req) });

    const json     = JSON.stringify(payload, null, 2);
    const filename = `BotIvA-datos-personales-${userId.slice(-8)}-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error('[gdpr/export GET]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'No se pudo generar la exportación.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  let password: string;
  try {
    const body = await req.json() as { password?: string };
    password = typeof body.password === 'string' ? body.password.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'La clave debe tener al menos 6 caracteres.' }, { status: 400 });
  }

  try {
    await connectDB();
    const payload = await buildPersonalDataExport(userId);
    await recordAudit({ userId, action: 'gdpr.export', resource: 'account', ip: getClientIp(req) });

    const json     = JSON.stringify(payload, null, 2);
    const filename = `BotIvA-datos-personales-${userId.slice(-8)}-${new Date().toISOString().slice(0, 10)}.html`;
    const html     = buildEncryptedHtml(json, password, { type: 'gdpr', filename });

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[gdpr/export POST]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'No se pudo generar la exportación.' }, { status: 500 });
  }
}
