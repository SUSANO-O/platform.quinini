import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ enabled: false });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ enabled: false });

  await connectDB();
  const user = await User.findById(userId).lean() as { twoFactorEnabled?: boolean } | null;
  return NextResponse.json({ enabled: user?.twoFactorEnabled ?? false });
}
