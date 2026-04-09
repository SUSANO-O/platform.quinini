/**
 * POST /api/checkout — alias de POST /api/billing/plan (compatibilidad).
 */

import type { NextRequest } from 'next/server';
import { postSubscribePlan } from '@/lib/billing';

export async function POST(req: NextRequest) {
  return postSubscribePlan(req);
}
