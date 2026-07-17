/**
 * GET  /api/admin/skills — listar catálogo (incluye deshabilitadas)
 * POST /api/admin/skills — crear skill
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createSkillCatalogEntry, listSkillCatalog } from '@/lib/skill-catalog-service';
import type { SkillCatalogDocInput } from '@/lib/skill-catalog-service';

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const kind = req.nextUrl.searchParams.get('kind');
  const catalog = await listSkillCatalog({
    includeDisabled: true,
    ...(kind === 'profile' || kind === 'capability' ? { kind } : {}),
  });

  return NextResponse.json({ success: true, catalog });
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Partial<SkillCatalogDocInput>;
  if (!body.id || !body.label) {
    return NextResponse.json({ error: 'id y label son requeridos.' }, { status: 400 });
  }

  try {
    const created = await createSkillCatalogEntry(
      {
        id: String(body.id),
        label: String(body.label),
        description: typeof body.description === 'string' ? body.description : '',
        color: typeof body.color === 'string' ? body.color : '#94a3b8',
        icon: typeof body.icon === 'string' ? body.icon : '✨',
        kind: body.kind === 'profile' ? 'profile' : 'capability',
        category: typeof body.category === 'string' ? body.category : 'general',
        tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string') : [],
        defaultPriority: typeof body.defaultPriority === 'number' ? body.defaultPriority : 60,
        catalogEnabled: body.catalogEnabled !== false,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
        config: {
          prompt_extension:
            typeof body.config?.prompt_extension === 'string' ? body.config.prompt_extension : '',
          active_tools: Array.isArray(body.config?.active_tools)
            ? body.config.active_tools.filter((t): t is string => typeof t === 'string')
            : [],
          ...(body.config?.llm_settings && typeof body.config.llm_settings === 'object'
            ? { llm_settings: body.config.llm_settings }
            : {}),
        },
      },
      adminId,
    );
    return NextResponse.json({ success: true, skill: created }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al crear skill.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
