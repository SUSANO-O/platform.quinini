/**
 * GET    /api/admin/subscriptions/[userId]  → suscripción actual del usuario
 * PUT    /api/admin/subscriptions/[userId]  → crear o actualizar (upsert)
 * DELETE /api/admin/subscriptions/[userId]  → eliminar suscripción
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { recordAudit } from '@/lib/audit-log';
import { VALID_FEATURE_OVERRIDES } from '@/lib/plan-catalog';

const VALID_PLANS   = ['free', 'solo', 'team', 'plus', 'business', 'enterprise'] as const;
const VALID_STATUSES = ['trialing', 'active', 'canceled', 'past_due', 'incomplete'] as const;
/** Overrides de feature que un admin puede activar manualmente (fuente única en plan-catalog). */
const VALID_FEATURES = VALID_FEATURE_OVERRIDES;

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const adminId = verifySessionToken(token);
  if (!adminId) return null;
  await connectDB();
  const admin = await User.findById(adminId).lean() as { role?: string } | null;
  return admin?.role === 'admin' ? adminId : null;
}

type Params = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { userId } = await params;
  await connectDB();

  const [user, sub] = await Promise.all([
    User.findById(userId).lean() as Promise<{ email: string; displayName?: string } | null>,
    Subscription.findOne({ userId }).lean(),
  ]);

  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  return NextResponse.json({ subscription: sub ?? null, user: { email: user.email, displayName: user.displayName } });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { userId } = await params;
  const body = await req.json() as {
    plan?: string;
    status?: string;
    trialStartedAt?: string | null;
    trialEndsAt?: string | null;
    currentPeriodStart?: number | null;
    currentPeriodEnd?: number | null;
    cancelAtPeriodEnd?: boolean;
    lsCustomerId?: string | null;
    lsSubscriptionId?: string | null;
    notes?: string | null;
    features?: string[];
    scheduledTaskLimit?: number | null;
  };

  if (body.plan && !VALID_PLANS.includes(body.plan as typeof VALID_PLANS[number])) {
    return NextResponse.json({ error: 'Plan no válido.' }, { status: 400 });
  }
  if (body.status && !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
    return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 });
  }

  await connectDB();
  const target = await User.findById(userId).lean() as { email: string } | null;
  if (!target) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (body.plan    !== undefined) update.plan   = body.plan;
  if (body.status  !== undefined) update.status = body.status;
  if (body.cancelAtPeriodEnd !== undefined) update.cancelAtPeriodEnd = body.cancelAtPeriodEnd;

  // Dates
  if (body.trialStartedAt !== undefined) update.trialStartedAt = body.trialStartedAt ? new Date(body.trialStartedAt) : null;
  if (body.trialEndsAt    !== undefined) update.trialEndsAt    = body.trialEndsAt    ? new Date(body.trialEndsAt)    : null;

  // Epoch seconds
  if (body.currentPeriodStart !== undefined) update.currentPeriodStart = body.currentPeriodStart ?? 0;
  if (body.currentPeriodEnd   !== undefined) update.currentPeriodEnd   = body.currentPeriodEnd   ?? 0;

  // LemonSqueezy IDs opcionales
  if (body.lsCustomerId      !== undefined) update.lsCustomerId      = body.lsCustomerId      ?? null;
  if (body.lsSubscriptionId  !== undefined) update.lsSubscriptionId  = body.lsSubscriptionId  ?? null;

  // Overrides de feature (allowlist): ej. activar 'scheduled_tasks' a un plan inferior.
  if (body.features !== undefined) {
    update.features = Array.isArray(body.features)
      ? [...new Set(body.features.filter((f) => (VALID_FEATURES as readonly string[]).includes(f)))]
      : [];
  }

  // Override del límite de tareas programadas (null = usar el del plan; -1 = ilimitado).
  if (body.scheduledTaskLimit !== undefined) {
    const n = body.scheduledTaskLimit;
    if (n === null) {
      update.scheduledTaskLimit = null;
    } else if (typeof n === 'number' && Number.isInteger(n) && n >= -1 && n <= 9999) {
      update.scheduledTaskLimit = n;
    } else {
      return NextResponse.json({ error: 'scheduledTaskLimit debe ser un entero ≥ -1 (o null).' }, { status: 400 });
    }
  }

  const sub = await Subscription.findOneAndUpdate(
    { userId },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await recordAudit({
    userId: adminId,
    action: 'admin.subscription.upsert',
    resource: userId,
    meta: { plan: update.plan, status: update.status, features: update.features, targetEmail: target.email },
  });

  return NextResponse.json({ ok: true, subscription: sub });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { userId } = await params;
  await connectDB();

  const target = await User.findById(userId).lean() as { email: string } | null;
  if (!target) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  await Subscription.deleteOne({ userId });
  await recordAudit({
    userId: adminId,
    action: 'admin.subscription.delete',
    resource: userId,
    meta: { targetEmail: target.email },
  });

  return NextResponse.json({ ok: true });
}
