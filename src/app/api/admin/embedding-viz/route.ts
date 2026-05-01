/**
 * GET /api/admin/embedding-viz — proxy seguro hacia AIBackHub (PCA 3D en el hub).
 * Solo sesión admin de la landing; claves solo en servidor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  await connectDB();
  const user = await User.findById(userId).lean() as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return userId;
}

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const base = getAibackhubBaseUrl();
  if (!base) {
    return NextResponse.json(
      { ok: false, error: 'BACKEND_URL no configurada; no se puede consultar AIBackHub.' },
      { status: 503 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const url = new URL(`${base}/api/admin/embedding-viz/points`);
  const limit = sp.get('limit');
  if (limit) url.searchParams.set('limit', limit);
  const agentId = sp.get('agentId');
  if (agentId) url.searchParams.set('agentId', agentId);
  const type = sp.get('type');
  if (type) url.searchParams.set('type', type);

  const headers: Record<string, string> = { ...hubCreateHeaders() };
  const tenantOverride = sp.get('tenantId')?.trim();
  if (tenantOverride) headers['x-tenant-id'] = tenantOverride;

  const adminKey = process.env.AIBACKHUB_ADMIN_KEY?.trim();
  if (adminKey) headers['x-admin-key'] = adminKey;

  try {
    const res = await fetch(url.toString(), { headers, cache: 'no-store' });
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { ok: false, error: text.slice(0, 400) };
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Error al conectar con AIBackHub.' },
      { status: 502 },
    );
  }
}
