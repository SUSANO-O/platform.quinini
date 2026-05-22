import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getUserBillingProfile, saveUserBillingProfile } from '@/lib/billing-user-data';

type Params = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const { userId } = await params;
  const data = await getUserBillingProfile(userId);
  if (!data) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const { userId } = await params;
  const body = await req.json().catch(() => ({}));
  const profile = await saveUserBillingProfile(userId, body);
  return NextResponse.json({ ok: true, profile });
}
