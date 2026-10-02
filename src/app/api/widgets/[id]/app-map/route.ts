/**
 * GET /api/widgets/[id]/app-map            → { appMap }   (?format=csv → descarga CSV)
 * PUT /api/widgets/[id]/app-map            ← { appMap: [...] } | { csv: "..." }
 *
 * Mapa de la app donde vive el widget (vistas, descripción y pestañas). Se inyecta solo en el
 * contexto del agente; ver src/lib/widget-app-map.ts. Las filas inválidas se descartan y se
 * devuelven en `errors` para que el panel las muestre.
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Widget } from '@/lib/db/models';
import { appMapFromCsv, appMapToCsv, normalizeAppMap } from '@/lib/widget-app-map';
import { forgetWidgetAppMap } from '@/lib/widget-page-visits';

type Params = { params: Promise<{ id: string }> };

const MAX_BODY_BYTES = 512 * 1024;

function auth(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  return token ? verifySessionToken(token) : null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  await connectDB();
  const w = (await Widget.findOne({ _id: id, userId }).select('+appMap name').lean()) as
    | { appMap?: unknown; name?: string } | null;
  if (!w) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  const { map } = normalizeAppMap(w.appMap ?? []);
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const slug = String(w.name || 'widget').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'widget';
    return new NextResponse(appMapToCsv(map), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mapa-${slug}.csv"`,
      },
    });
  }
  return NextResponse.json({ appMap: map });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Mapa demasiado grande (máx. 512 KB).' }, { status: 413 });
  let body: { appMap?: unknown; csv?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const parsed =
    typeof body.csv === 'string' ? appMapFromCsv(body.csv)
    : body.appMap !== undefined ? normalizeAppMap(body.appMap)
    : null;
  if (!parsed) return NextResponse.json({ error: 'Envía appMap (lista) o csv (texto).' }, { status: 400 });
  const sentRows = typeof body.csv === 'string' || (Array.isArray(body.appMap) && body.appMap.length > 0);
  if (!parsed.map.length && sentRows) {
    return NextResponse.json({ error: 'Ninguna fila válida.', errors: parsed.errors }, { status: 400 });
  }

  await connectDB();
  const res = await Widget.updateOne({ _id: id, userId }, { $set: { appMap: parsed.map } });
  if (!res.matchedCount) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });
  forgetWidgetAppMap(id);
  return NextResponse.json({ appMap: parsed.map, errors: parsed.errors });
}
