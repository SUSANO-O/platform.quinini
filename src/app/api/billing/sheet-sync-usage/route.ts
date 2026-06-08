/**
 * GET  /api/billing/sheet-sync-usage — uso y costo estimado del sync Sheets
 * PATCH /api/billing/sheet-sync-usage — activar/desactivar cobro $1/GB (Plus+)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { SheetSnapshot, SheetSyncUsage, Subscription } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import {
  sheetNightlySyncEnabled,
  sheetSyncBillingActive,
  sheetSyncChargeUsd,
  SHEET_SYNC_USD_PER_GB,
  effectiveProductPlan,
} from '@/lib/plan-catalog';

function authUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const userId = authUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  const sub = await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1, features: 1, sheetSyncBillingEnabled: 1 })
    .lean() as {
      plan?: string;
      status?: string;
      features?: string[];
      sheetSyncBillingEnabled?: boolean;
    } | null;

  const plan = effectiveProductPlan(sub?.plan ?? 'free', sub?.status ?? 'free');
  const canUse = sheetNightlySyncEnabled(plan, sub?.features);
  const billingEnabled = sub?.sheetSyncBillingEnabled === true;
  const billingActive = sheetSyncBillingActive(billingEnabled);

  const snaps = await SheetSnapshot.find({ userId }).select({ byteSize: 1, syncedAt: 1, sheetName: 1 }).lean();
  const bytesStored = snaps.reduce((acc, s) => acc + (typeof s.byteSize === 'number' ? s.byteSize : 0), 0);
  const month = new Date().toISOString().slice(0, 7);
  const usage = await SheetSyncUsage.findOne({ userId, month }).lean();

  return NextResponse.json({
    canUseSheetSync: canUse,
    billingEnabled,
    billingActive,
    usdPerGb: SHEET_SYNC_USD_PER_GB,
    bytesStored,
    gbStored: Math.round((bytesStored / (1024 ** 3)) * 1000) / 1000,
    estimatedUsd: billingActive ? sheetSyncChargeUsd(bytesStored) : 0,
    snapshotCount: snaps.length,
    lastSyncAt: usage?.lastSyncAt ?? snaps[0]?.syncedAt ?? null,
    syncSchedule: '3:00 AM America/Bogota',
  });
}

export async function PATCH(req: NextRequest) {
  const userId = authUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { billingEnabled?: boolean };
  if (typeof body.billingEnabled !== 'boolean') {
    return NextResponse.json({ error: 'billingEnabled (boolean) requerido.' }, { status: 400 });
  }

  await connectDB();
  const sub = await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1, features: 1 })
    .lean() as { plan?: string; status?: string; features?: string[] } | null;

  const plan = effectiveProductPlan(sub?.plan ?? 'free', sub?.status ?? 'free');
  if (!sheetNightlySyncEnabled(plan, sub?.features)) {
    return NextResponse.json(
      { error: 'Sync nocturno Sheets requiere plan Plus o superior.' },
      { status: 403 },
    );
  }

  await Subscription.updateOne({ userId }, { $set: { sheetSyncBillingEnabled: body.billingEnabled } });

  return NextResponse.json({
    ok: true,
    billingEnabled: body.billingEnabled,
    billingActive: sheetSyncBillingActive(body.billingEnabled),
  });
}
