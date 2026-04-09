/**
 * POST /api/billing/resume — revierte cancelación al final del periodo.
 */

import type { NextRequest } from 'next/server';
import { postResumeSubscription } from '@/lib/billing';

export async function POST(req: NextRequest) {
  return postResumeSubscription(req);
}
