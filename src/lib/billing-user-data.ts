import { connectDB } from '@/lib/db/connection';
import { ManualInvoice, Subscription as SubscriptionModel, User } from '@/lib/db/models';
import { getPaymentService } from '@/lib/payment';
import { normalizeBillingProfile } from '@/lib/billing-profile';
import { getDefaultIssuer, nextManualInvoiceNumber } from '@/lib/manual-invoice-pdf';
import {
  buildLineItemFromInput,
  computeInvoiceTotals,
  summarizeConcepts,
  type CreateManualInvoiceLineInput,
} from '@/lib/manual-invoice-line';
import type { InvoiceItem } from '@/lib/payment/interface';

export type { CreateManualInvoiceLineInput } from '@/lib/manual-invoice-line';

export type CreateManualInvoiceInput = {
  lineItems: CreateManualInvoiceLineInput[];
  taxPercent: number;
  paymentMethod: string;
  paymentRef?: string;
};

export async function getUserBillingProfile(userId: string) {
  await connectDB();
  const user = await User.findById(userId)
    .select({ email: 1, displayName: 1, billingProfile: 1 })
    .lean();
  if (!user) return null;
  return {
    profile: normalizeBillingProfile(user.billingProfile),
    email: user.email ?? '',
    displayName: user.displayName ?? '',
  };
}

export async function saveUserBillingProfile(userId: string, raw: unknown) {
  await connectDB();
  const profile = normalizeBillingProfile(raw);
  await User.findByIdAndUpdate(userId, { $set: { billingProfile: profile } });
  return profile;
}

export async function listLemonSqueezyInvoices(userId: string): Promise<InvoiceItem[]> {
  await connectDB();
  const sub = await SubscriptionModel.findOne({ userId });
  const user = await User.findById(userId).select({ email: 1 }).lean() as { email?: string } | null;
  if (!sub?.lsCustomerId) return [];

  const paymentService = getPaymentService();
  return paymentService.getInvoices({
    customerId: sub.lsCustomerId,
    subscriptionIds: sub.lsSubscriptionId ? [sub.lsSubscriptionId] : [],
    userEmail: user?.email ?? '',
  });
}

export async function getLemonSqueezyPortalUrl(userId: string, returnUrl: string): Promise<string | null> {
  await connectDB();
  const sub = await SubscriptionModel.findOne({ userId }).select({ lsCustomerId: 1 }).lean() as
    | { lsCustomerId?: string | null }
    | null;
  if (!sub?.lsCustomerId) return null;
  const paymentService = getPaymentService();
  return paymentService.getBillingPortalUrl(sub.lsCustomerId, returnUrl);
}

export async function generateLsInvoicePdfUrl(
  userId: string,
  invoiceId: string,
  kind: 'subscription' | 'order',
): Promise<string | null> {
  await connectDB();
  const user = await User.findById(userId).select({ billingProfile: 1 }).lean();
  if (!user) return null;
  const profile = normalizeBillingProfile(user.billingProfile);
  const paymentService = getPaymentService();
  return paymentService.generateInvoiceDownloadUrl(invoiceId, kind, profile);
}

export async function listManualInvoices(userId: string) {
  await connectDB();
  return ManualInvoice.find({ userId, status: 'issued' }).sort({ issuedAt: -1 }).limit(100).lean();
}

export async function createManualInvoice(userId: string, input: CreateManualInvoiceInput) {
  await connectDB();
  const user = await User.findById(userId).select({ email: 1, billingProfile: 1 }).lean();
  if (!user) return { error: 'Usuario no encontrado.' as const };

  const buyer = { ...normalizeBillingProfile(user.billingProfile), email: user.email ?? '' };
  if (!buyer.companyName && !buyer.taxId) {
    return { error: 'Completa al menos nombre/razón social o NIF en datos de facturación del usuario.' as const };
  }

  const lineItems = input.lineItems.map(buildLineItemFromInput);
  const totals = computeInvoiceTotals(lineItems, input.taxPercent);
  const invoiceNumber = await nextManualInvoiceNumber(userId);

  const doc = await ManualInvoice.create({
    userId,
    invoiceNumber,
    issuedAt: totals.issuedAt,
    concept: summarizeConcepts(lineItems),
    lineItems,
    amountCents: totals.amountCents,
    currency: totals.currency,
    taxPercent: totals.taxPercent,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    paymentMethod: input.paymentMethod.trim().slice(0, 120),
    paymentRef: (input.paymentRef ?? '').trim().slice(0, 200),
    notes: lineItems.map((l) => l.notes).filter(Boolean).join('\n').slice(0, 2000),
    buyer,
    issuer: getDefaultIssuer(),
    status: 'issued',
  });

  return {
    ok: true as const,
    id: String(doc._id),
    invoiceNumber,
  };
}
