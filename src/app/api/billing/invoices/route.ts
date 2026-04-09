import type { NextRequest } from 'next/server';
import { getBillingInvoices } from '@/lib/billing';

export async function GET(req: NextRequest) {
  return getBillingInvoices(req);
}
