import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { verifySignature, SIGNATURE_HEADER } from '@/lib/hub-signature';

function isAuthorized(req: NextRequest, rawBody: string, expected: string): boolean {
  const sig = req.headers.get(SIGNATURE_HEADER);
  if (sig) return verifySignature(rawBody, sig, expected);
  const legacy = req.headers.get('x-hub-sync-secret')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  return legacy === expected;
}

/**
 * POST /api/internal/set-platform-status
 * Cambia unicamente `isPlatform` en landing (`clientagents`).
 * Pensado para el switch "Platform agent" del hub.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.HUB_TO_LANDING_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: 'No configurado.' }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!isAuthorized(req, rawBody, expected)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  let body: { agentHubId?: string; landingClientAgentId?: string; isPlatform?: boolean };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const agentHubId = typeof body.agentHubId === 'string' ? body.agentHubId.trim() : '';
  if (!agentHubId) {
    return NextResponse.json({ error: 'agentHubId requerido.' }, { status: 400 });
  }
  if (typeof body.isPlatform !== 'boolean') {
    return NextResponse.json({ error: 'isPlatform debe ser boolean.' }, { status: 400 });
  }

  await connectDB();

  const filter: Record<string, unknown> = { agentHubId };
  const cid = typeof body.landingClientAgentId === 'string' ? body.landingClientAgentId.trim() : '';
  if (/^[a-f0-9]{24}$/i.test(cid)) {
    filter._id = new mongoose.Types.ObjectId(cid);
  }

  const r = await ClientAgent.updateMany(filter, { $set: { isPlatform: body.isPlatform } });

  return NextResponse.json({
    ok: true,
    agentHubId,
    isPlatform: body.isPlatform,
    matched: r.matchedCount,
    modified: r.modifiedCount,
  });
}
