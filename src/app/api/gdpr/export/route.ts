/**
 * GET /api/gdpr/export — descarga JSON con datos personales (RGPD).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { buildPersonalDataExport } from '@/lib/gdpr-pack';
import { recordAudit } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  try {
    await connectDB();
    const payload = await buildPersonalDataExport(userId);
    await recordAudit({
      userId,
      action: 'gdpr.export',
      resource: 'account',
      ip: getClientIp(req),
    });

    const json = JSON.stringify(payload, null, 2);
    const filename = `matias-datos-personales-${userId.slice(-8)}-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    console.error('[gdpr/export]', msg);
    return NextResponse.json({ error: 'No se pudo generar la exportación.' }, { status: 500 });
  }
}
