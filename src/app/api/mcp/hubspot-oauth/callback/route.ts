import { NextRequest, NextResponse } from 'next/server';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';

function dashboardRedirect(
  origin: string,
  landingAgentId: string | undefined,
  params: Record<string, string>,
): NextResponse {
  const hex = landingAgentId?.trim() ?? '';
  const path =
    /^[a-f0-9]{24}$/i.test(hex) ? `/dashboard/agents/${hex}` : '/dashboard/agents';
  const u = new URL(path, origin);
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v);
  }
  return NextResponse.redirect(u);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const redirectUri = new URL('/api/mcp/hubspot-oauth/callback', origin).href;
  const sp = req.nextUrl.searchParams;
  const oauthErr = sp.get('error');
  if (oauthErr) {
    const desc = (sp.get('error_description') || oauthErr).slice(0, 400);
    return dashboardRedirect(origin, undefined, {
      hubspot_oauth: 'err',
      hubspot_oauth_detail: desc,
    });
  }

  const code = sp.get('code')?.trim();
  const state = sp.get('state')?.trim();
  if (!code || !state) {
    return dashboardRedirect(origin, undefined, {
      hubspot_oauth: 'err',
      hubspot_oauth_detail: 'Falta code o state en la respuesta de HubSpot.',
    });
  }

  const base = getAibackhubBaseUrl();
  if (!base) {
    return dashboardRedirect(origin, undefined, {
      hubspot_oauth: 'err',
      hubspot_oauth_detail: 'BACKEND_URL no configurada en la landing.',
    });
  }

  try {
    const res = await fetch(`${base}/api/mcp/hubspot-oauth/complete`, {
      method: 'POST',
      headers: hubCreateHeaders(),
      body: JSON.stringify({ code, state, redirectUri }),
      signal: AbortSignal.timeout(90_000),
    });
    const j = await res.json().catch(() => ({}));
    const data = (j?.data ?? j) as {
      ok?: boolean;
      syncError?: string;
      landingAgentId?: string;
    };
    const landingAgentId =
      typeof data.landingAgentId === 'string' ? data.landingAgentId : undefined;
    if (!res.ok) {
      const msg =
        (typeof j?.error === 'object' && j?.error !== null && 'message' in j.error
          ? String((j.error as { message: string }).message)
          : '') ||
        (typeof j?.error === 'string' ? j.error : '') ||
        'No se pudo completar OAuth HubSpot.';
      return dashboardRedirect(origin, landingAgentId, {
        hubspot_oauth: 'err',
        hubspot_oauth_detail: msg.slice(0, 400),
      });
    }
    if (data?.ok === false) {
      const msg =
        (typeof data.syncError === 'string' && data.syncError) ||
        'Tokens guardados pero la sincronización MCP falló; revisa la conexión y vuelve a sincronizar.';
      return dashboardRedirect(origin, landingAgentId, {
        hubspot_oauth: 'partial',
        hubspot_oauth_detail: msg.slice(0, 400),
      });
    }
    return dashboardRedirect(origin, landingAgentId, { hubspot_oauth: 'ok' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return dashboardRedirect(origin, undefined, {
      hubspot_oauth: 'err',
      hubspot_oauth_detail: msg.slice(0, 400),
    });
  }
}
