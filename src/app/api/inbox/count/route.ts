/**
 * GET /api/inbox/count — número de solicitudes abiertas (badge sidebar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession } from '@/lib/db/models';
import { inboxSessionFilter } from '@/lib/inbox-handoff';
import { verifySessionToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();

  // Solo "nuevas sin ver": nunca abiertas por el agente, o con un mensaje del
  // visitante más reciente que la última vez que el agente abrió la conversación.
  const openCount = await ConversationSession.countDocuments({
    $and: [
      inboxSessionFilter(userId, 'open'),
      {
        $or: [
          { agentLastSeenAt: null },
          { $expr: { $gt: ['$lastVisitorMessageAt', '$agentLastSeenAt'] } },
        ],
      },
    ],
  });

  return NextResponse.json({ openCount });
}
