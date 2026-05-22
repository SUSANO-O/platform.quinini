export type BillingProfile = {
  companyName?: string;
  taxId?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
};

export function isBillingProfileReady(profile: BillingProfile): boolean {
  return Boolean(profile.companyName?.trim() || profile.taxId?.trim());
}

export function formatBillingProfileSummary(profile: BillingProfile, email?: string): string {
  const parts: string[] = [];
  if (profile.companyName?.trim()) parts.push(profile.companyName.trim());
  if (profile.taxId?.trim()) parts.push(profile.taxId.trim());
  const location = [profile.address, profile.city, profile.state, profile.zipCode, profile.country]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(', ');
  if (location) parts.push(location);
  if (email?.trim()) parts.push(email.trim());
  return parts.join(' · ') || 'Sin datos fiscales';
}

export function normalizeBillingProfile(raw: unknown): BillingProfile {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const str = (k: string) => (typeof o[k] === 'string' ? String(o[k]).trim() : '');
  return {
    companyName: str('companyName'),
    taxId: str('taxId'),
    address: str('address'),
    city: str('city'),
    state: str('state'),
    zipCode: str('zipCode'),
    country: str('country'),
  };
}

export function billingProfileToLsParams(profile: BillingProfile) {
  const zip = profile.zipCode?.trim();
  return {
    name: profile.companyName || undefined,
    address: profile.address || undefined,
    city: profile.city || undefined,
    state: profile.state || undefined,
    zipCode: zip && /^\d+$/.test(zip) ? parseInt(zip, 10) : undefined,
    country: profile.country || undefined,
  };
}
