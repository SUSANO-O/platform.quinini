/**
 * GET /api/admin/leads — lista los leads del onboarding para el panel de admin.
 * Solo admin. Orden: más recientes primero. Filtro opcional por estado (?status=new).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { connectDB } from '@/lib/db/connection';
import { Lead } from '@/lib/db/models';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 });

  await connectDB();
  const status = req.nextUrl.searchParams.get('status')?.trim();
  const query = status ? { status } : {};
  const leads = await Lead.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return NextResponse.json({ leads });
}
