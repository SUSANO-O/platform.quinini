/**
 * GET  /api/admin/registration-codes        — listar todos los códigos
 * POST /api/admin/registration-codes        — crear un código nuevo
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, RegistrationCode } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { randomBytes } from 'crypto';
import { PLAN_ORDER, type PlanId } from '@/lib/plan-catalog';
import { normalizeTrialDays } from '@/lib/registration-codes-env';

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  await connectDB();
  const user = await User.findById(userId).lean() as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return userId;
}

function generateCode(): string {
  return randomBytes(4).toString('hex').toUpperCase(); // ej: A3F9B2C1
}

const VALID_PLANS = PLAN_ORDER;

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  await connectDB();

  const codes = await RegistrationCode.find()
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ codes });
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });

  const plan = String(body.plan ?? '').toLowerCase() as PlanId;
  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'Plan inválido.' }, { status: 400 });
  }

  const maxUses = Math.max(1, Math.min(1000, Number(body.maxUses ?? 1)));
  const trialDays = normalizeTrialDays(body.trialDays);
  const note    = String(body.note ?? '').trim().slice(0, 120);

  // Código personalizado o autogenerado
  let code = String(body.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
  if (!code) code = generateCode();

  // Expiración opcional
  let expiresAt: Date | null = null;
  if (body.expiresAt && typeof body.expiresAt === 'string') {
    const d = new Date(body.expiresAt);
    if (!isNaN(d.getTime())) expiresAt = d;
  }

  // Verificar unicidad
  const exists = await RegistrationCode.exists({ code });
  if (exists) {
    return NextResponse.json({ error: `El código "${code}" ya existe.` }, { status: 409 });
  }

  const doc = await RegistrationCode.create({
    code,
    plan,
    maxUses,
    trialDays,
    note,
    expiresAt,
    createdBy: adminId,
  });

  return NextResponse.json({ code: doc }, { status: 201 });
}
