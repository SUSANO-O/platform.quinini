import { NextRequest, NextResponse } from 'next/server';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';
import { verifySessionToken } from '@/lib/auth';
import { getUserAllowedProviders } from '@/lib/model-provider-policy';

/**
 * Proxy a AIBackHub GET /api/models/catalog/for-agent-hub
 * (enabled + offerForNewAgents — mismo criterio que el selector de agentes en AgentFlowhub).
 */
export async function GET(req: NextRequest) {
  const base = getAibackhubBaseUrl();
  if (!base) {
    return NextResponse.json(
      { success: false, error: 'BACKEND_URL no configurado en el servidor.' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${base}/api/models/catalog/for-agent-hub`, {
      method: 'GET',
      headers: hubCreateHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { models?: Array<{ provider?: string }> };
      models?: Array<{ provider?: string }>;
      [k: string]: unknown;
    };
    if (!res.ok) {
      return NextResponse.json(json, { status: res.status });
    }
    const token = req.cookies.get('afhub_session')?.value;
    const userId = token ? verifySessionToken(token) : null;
    if (!userId) return NextResponse.json(json);
    const allowedProviders = await getUserAllowedProviders(userId);
    if (!allowedProviders.length) return NextResponse.json(json);
    const data = (json.data ?? json) as { models?: Array<{ provider?: string }> };
    const list = Array.isArray(data.models) ? data.models : [];
    const filtered = list.filter((m) => {
      const provider = typeof m?.provider === 'string' ? m.provider.trim().toLowerCase() : '';
      return provider && allowedProviders.includes(provider as typeof allowedProviders[number]);
    });
    if (json.data && typeof json.data === 'object') {
      return NextResponse.json({
        ...json,
        data: {
          ...(json.data as Record<string, unknown>),
          models: filtered,
        },
      });
    }
    return NextResponse.json({ ...json, models: filtered });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al contactar AIBackHub';
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}
