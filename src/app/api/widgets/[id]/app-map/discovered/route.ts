/**
 * GET /api/widgets/[id]/app-map/discovered → páginas que visitan los usuarios reales del widget
 * (ruta, nombres de parámetros, pestañas, visitas), marcando cuáles faltan en el mapa.
 * Nunca contiene valores de parámetros ni datos de usuarios.
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Widget, WidgetPageVisit } from '@/lib/db/models';
import { normalizeAppMap } from '@/lib/widget-app-map';
import { MAX_DISCOVERED_PATHS } from '@/lib/widget-page-visits';

type Params = { params: Promise<{ id: string }> };

type VisitRow = {
  path: string;
  paramKeys?: string[];
  hashes?: string[];
  visits?: number;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
};

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const token = req.cookies.get('afhub_session')?.value;
  const userId = token ? verifySessionToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  await connectDB();
  const w = (await Widget.findOne({ _id: id, userId }).select('+appMap').lean()) as { appMap?: unknown } | null;
  if (!w) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });
  const map = normalizeAppMap(w.appMap ?? []).map;
  const byPath = new Map(map.map((e) => [e.path, e]));

  const rows = (await WidgetPageVisit.find({ widgetId: id, userId })
    .sort({ visits: -1 })
    .limit(MAX_DISCOVERED_PATHS)
    .select({ _id: 0, path: 1, paramKeys: 1, hashes: 1, visits: 1, firstSeenAt: 1, lastSeenAt: 1 })
    .lean()) as VisitRow[];

  const pages = rows.map((r) => {
    const entry = byPath.get(r.path);
    const known = new Set((entry?.tabs ?? []).map((t) => t.hash));
    return {
      path: r.path,
      paramKeys: r.paramKeys ?? [],
      hashes: r.hashes ?? [],
      visits: r.visits ?? 0,
      firstSeenAt: r.firstSeenAt ?? null,
      lastSeenAt: r.lastSeenAt ?? null,
      inMap: !!entry,
      missingTabs: (r.hashes ?? []).filter((h) => !known.has(h)),
    };
  });
  return NextResponse.json({ pages, total: pages.length, mapSize: map.length });
}
