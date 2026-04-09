/**
 * POST /api/billing/cancel  { atPeriodEnd?: boolean }
 */

import type { NextRequest } from 'next/server';
import { postCancelSubscription } from '@/lib/billing';

export async function POST(req: NextRequest) {
  return postCancelSubscription(req);
}
