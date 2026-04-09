import type { NextRequest } from 'next/server';
import { postCreateSetupIntent } from '@/lib/billing';

export async function POST(req: NextRequest) {
  return postCreateSetupIntent(req);
}
