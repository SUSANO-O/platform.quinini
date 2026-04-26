import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { runSubscriptionReminders } from '@/lib/subscription-reminders';

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

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    dryRun?: boolean;
    kinds?: Array<'trial' | 'renewal'>;
    plans?: Array<'free' | 'starter' | 'growth' | 'business' | 'enterprise'>;
    limit?: number;
  };

  const result = await runSubscriptionReminders({
    dryRun: body?.dryRun,
    kinds: body?.kinds,
    plans: body?.plans,
    limit: body?.limit,
  });

  return NextResponse.json(result);
}
