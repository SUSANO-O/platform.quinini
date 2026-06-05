/**
 * GET /api/skills/catalog — catálogo global para el editor de agentes (usuarios autenticados).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { listSkillCatalog } from '@/lib/skill-catalog-service';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const kind = req.nextUrl.searchParams.get('kind');
  const catalog = await listSkillCatalog({
    includeDisabled: false,
    ...(kind === 'profile' || kind === 'capability' ? { kind } : {}),
  });

  return NextResponse.json({ success: true, catalog });
}
