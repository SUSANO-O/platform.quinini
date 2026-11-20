/**
 * POST /api/leads — captura un lead del onboarding anónimo (/crear).
 *
 * Público (no requiere sesión): es la entrada del embudo. Limitado por IP para evitar abuso.
 * Guarda los datos del negocio + el agente que se armó en la colección `leads` con estado 'new'.
 * No ejecuta IA ni cobra nada.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Lead } from '@/lib/db/models';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimitAsync('leads', ip, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const collectFields = Array.isArray(body.collectFields)
    ? (body.collectFields as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 10)
    : [];

  // Requiere al menos algo útil para no guardar leads vacíos.
  const businessName = str(body.businessName, 120);
  const whatsapp = str(body.whatsapp, 40);
  const businessType = str(body.businessType, 40);
  if (!businessName && !whatsapp && !businessType) {
    return NextResponse.json({ error: 'Lead sin datos suficientes.' }, { status: 400 });
  }

  try {
    await connectDB();
    const lead = await Lead.create({
      source: 'onboarding-quiz',
      status: 'new',
      businessName,
      businessType,
      goal: str(body.goal, 40),
      tone: str(body.tone, 40),
      language: str(body.language, 20),
      collectFields,
      website: str(body.website, 300),
      whatsapp,
      agentName: str(body.agentName, 160),
      answers: body.answers && typeof body.answers === 'object' ? body.answers : {},
      userAgent: (req.headers.get('user-agent') ?? '').slice(0, 300),
    });
    return NextResponse.json({ ok: true, id: String(lead._id) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar el lead.' }, { status: 500 });
  }
}
