/**
 * POST /api/admin/skills/reseed — restaurar catálogo desde semilla por defecto
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { reseedSkillCatalogFromDefaults } from '@/lib/skill-catalog-service';

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const count = await reseedSkillCatalogFromDefaults(adminId);
  return NextResponse.json({ success: true, count });
}
