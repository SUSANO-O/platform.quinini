/**
 * GET  /api/widgets/[id]/allowed-origins  → listar orígenes permitidos
 * PUT  /api/widgets/[id]/allowed-origins  → reemplazar lista completa
 *
 * Lista vacía = cualquier origen (modo permisivo / desarrollo).
 * Lista con valores = solo esos dominios pueden usar este widget.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Widget } from '@/lib/db/models';

type Params = { params: Promise<{ id: string }> };

function auth(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  return token ? verifySessionToken(token) : null;
}

function normalizeOrigin(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.origin.toLowerCase();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  const widget = await Widget.findOne({ _id: id, userId }).select({ allowedOrigins: 1 }).lean() as
    | { allowedOrigins?: string[] } | null;

  if (!widget) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  return NextResponse.json({ allowedOrigins: widget.allowedOrigins ?? [] });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json() as { allowedOrigins?: unknown };
  if (!Array.isArray(body.allowedOrigins)) {
    return NextResponse.json({ error: 'allowedOrigins debe ser un array.' }, { status: 400 });
  }

  if (body.allowedOrigins.length > 20) {
    return NextResponse.json({ error: 'Máximo 20 orígenes permitidos.' }, { status: 400 });
  }

  const normalized: string[] = [];
  for (const raw of body.allowedOrigins) {
    const n = normalizeOrigin(String(raw));
    if (!n) {
      return NextResponse.json({ error: `Origen inválido: ${raw}. Usa formato https://dominio.com` }, { status: 400 });
    }
    if (!normalized.includes(n)) normalized.push(n);
  }

  await connectDB();
  const result = await Widget.findOneAndUpdate(
    { _id: id, userId },
    { $set: { allowedOrigins: normalized } },
    { new: true },
  ).select({ allowedOrigins: 1 }).lean() as { allowedOrigins?: string[] } | null;

  if (!result) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  return NextResponse.json({ ok: true, allowedOrigins: result.allowedOrigins ?? [] });
}
