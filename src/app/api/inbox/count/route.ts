/**
 * GET /api/inbox/count — número de solicitudes abiertas (badge sidebar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();

  const openCount = await ConversationSession.countDocuments({
    userId,
    escalated: true,
    handoffAt: { $exists: true, $ne: null },
    inboxStatus: { $ne: 'resolved' },
  });

  return NextResponse.json({ openCount });
}
