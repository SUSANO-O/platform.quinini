/**
 * GET  /api/user/escalation-ticket — configuración (sin apiToken)
 * PUT  /api/user/escalation-ticket — guardar integración Zendesk/Freshdesk
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription } from '@/lib/db/models';
import { canUseEscalationTickets } from '@/lib/plan-catalog';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** ¿El usuario puede usar tickets al escalar? (Business+ o override de admin). */
async function userTicketEligible(userId: string): Promise<boolean> {
  const sub = await Subscription.findOne({ userId }).select({ plan: 1, status: 1, features: 1 }).lean() as
    | { plan?: string; status?: string; features?: string[] }
    | null;
  return canUseEscalationTickets(sub?.plan ?? 'free', sub?.status ?? 'free', sub?.features);
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  const planEligible = await userTicketEligible(userId);
  const u = await User.findById(userId).select({ escalationTicketIntegration: 1 }).lean() as
    | { escalationTicketIntegration?: Record<string, unknown> }
    | null;

  const raw = u?.escalationTicketIntegration;
  const configured = Boolean(
    raw &&
      typeof raw === 'object' &&
      (raw.provider === 'zendesk' || raw.provider === 'freshdesk') &&
      typeof raw.subdomain === 'string' &&
      raw.subdomain &&
      typeof raw.apiToken === 'string' &&
      raw.apiToken,
  );

  return NextResponse.json({
    planEligible,
    configured,
    hasExistingConfig: Boolean(raw && typeof raw === 'object' && raw.subdomain),
    integration: configured && raw
      ? {
          provider: raw.provider,
          subdomain: raw.subdomain,
          email: typeof raw.email === 'string' ? raw.email : '',
          hasApiToken: true,
        }
      : raw && typeof raw === 'object' && raw.subdomain
        ? {
            provider: raw.provider === 'freshdesk' ? 'freshdesk' : 'zendesk',
            subdomain: String(raw.subdomain),
            email: typeof raw.email === 'string' ? raw.email : '',
            hasApiToken: Boolean(raw.apiToken),
          }
        : null,
  });
}

export async function PUT(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  if (!(await userTicketEligible(userId))) {
    return NextResponse.json(
      { error: 'Los tickets automáticos requieren plan Business o superior.' },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({})) as {
    provider?: string;
    subdomain?: string;
    apiToken?: string;
    email?: string;
    clear?: boolean;
  };

  if (body.clear === true) {
    await User.findByIdAndUpdate(userId, { $set: { escalationTicketIntegration: null } });
    return NextResponse.json({ ok: true, cleared: true });
  }

  const existing = await User.findById(userId).select({ escalationTicketIntegration: 1 }).lean() as
    | { escalationTicketIntegration?: Record<string, unknown> }
    | null;
  const prev = existing?.escalationTicketIntegration;

  const provider = body.provider === 'freshdesk' ? 'freshdesk' : body.provider === 'zendesk' ? 'zendesk' : null;
  const subdomainRaw = typeof body.subdomain === 'string' ? body.subdomain.trim() : '';
  const subdomain = subdomainRaw.replace(/\.(zendesk|freshdesk)\.com.*/i, '').replace(/^https?:\/\//i, '');
  const apiTokenInput = typeof body.apiToken === 'string' ? body.apiToken.trim() : '';
  const emailInput = typeof body.email === 'string' ? body.email.trim() : '';

  const prevToken =
    prev && typeof prev === 'object' && typeof prev.apiToken === 'string' ? prev.apiToken.trim() : '';
  const apiToken = apiTokenInput || prevToken;

  const providerFinal = provider
    ?? (prev && typeof prev === 'object' && prev.provider === 'freshdesk' ? 'freshdesk' : prev?.provider === 'zendesk' ? 'zendesk' : null);
  const subdomainFinal = subdomain
    || (prev && typeof prev === 'object' && typeof prev.subdomain === 'string' ? prev.subdomain.trim() : '');
  const emailFinal = emailInput
    || (prev && typeof prev === 'object' && typeof prev.email === 'string' ? prev.email.trim() : '');

  if (!providerFinal || !subdomainFinal || !apiToken) {
    return NextResponse.json(
      { error: 'Proveedor, subdominio y API token son requeridos.' },
      { status: 400 },
    );
  }
  if (providerFinal === 'zendesk' && !emailFinal) {
    return NextResponse.json({ error: 'Zendesk requiere el email del agente API.' }, { status: 400 });
  }

  await User.findByIdAndUpdate(userId, {
    $set: {
      escalationTicketIntegration: {
        provider: providerFinal,
        subdomain: subdomainFinal,
        apiToken,
        ...(emailFinal ? { email: emailFinal } : {}),
      },
    },
  });

  return NextResponse.json({ ok: true });
}
