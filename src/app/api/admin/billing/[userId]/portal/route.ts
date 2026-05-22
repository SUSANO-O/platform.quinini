import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getLemonSqueezyPortalUrl } from '@/lib/billing-user-data';

type Params = { params: Promise<{ userId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const { userId } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const url = await getLemonSqueezyPortalUrl(userId, `${appUrl}/admin/facturas`);
  if (!url) {
    return NextResponse.json({ error: 'Este usuario no tiene cliente LemonSqueezy asociado.' }, { status: 400 });
  }
  return NextResponse.json({ url });
}
