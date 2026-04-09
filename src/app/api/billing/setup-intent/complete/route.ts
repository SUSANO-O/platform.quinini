import type { NextRequest } from 'next/server';
import { postCompleteSetupIntent } from '@/lib/billing';

export async function POST(req: NextRequest) {
  return postCompleteSetupIntent(req);
}
