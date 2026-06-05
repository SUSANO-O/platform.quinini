/**
 * PUT    /api/admin/skills/[id] — actualizar skill
 * DELETE /api/admin/skills/[id] — eliminar skill
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import {
  deleteSkillCatalogEntry,
  getSkillCatalogById,
  updateSkillCatalogEntry,
} from '@/lib/skill-catalog-service';
import type { SkillCatalogDocInput } from '@/lib/skill-catalog-service';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { id } = await params;
  const skill = await getSkillCatalogById(id);
  if (!skill) return NextResponse.json({ error: 'Skill no encontrada.' }, { status: 404 });
  return NextResponse.json({ success: true, skill });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as Partial<SkillCatalogDocInput>;

  const updated = await updateSkillCatalogEntry(id, body, adminId);
  if (!updated) return NextResponse.json({ error: 'Skill no encontrada.' }, { status: 404 });
  return NextResponse.json({ success: true, skill: updated });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { id } = await params;
  const ok = await deleteSkillCatalogEntry(id);
  if (!ok) return NextResponse.json({ error: 'Skill no encontrada.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
