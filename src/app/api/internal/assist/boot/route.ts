import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import {
  resolveAssistScriptUrl,
  resolveInternalAssistBoot,
  type InternalAssistContext,
} from '@/lib/internal-assist-config';
import { enrichInternalAssistWithWidget } from '@/lib/internal-assist-widget';
import { loadAssistVisitorIdentity } from '@/lib/assist-session-identity';

function parseContext(raw: string | null): InternalAssistContext {
  return raw === 'marketing' ? 'marketing' : 'app';
}

/**
 * GET /api/internal/assist/boot?context=app|marketing
 * Config del asistente interno (solo usuarios autenticados en dashboard;
 * marketing permite acceso público con config no sensible).
 * En app: incluye visitorIdentity del usuario logueado (HubSpot + contexto).
 */
export async function GET(req: NextRequest) {
  const context = parseContext(req.nextUrl.searchParams.get('context'));
  const origin = req.nextUrl.origin;

  let sessionUserId: string | null = null;
  if (context === 'app') {
    const token = req.cookies.get('afhub_session')?.value;
    sessionUserId = token ? verifySessionToken(token) : null;
    if (!sessionUserId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  const config = await enrichInternalAssistWithWidget(
    context,
    resolveInternalAssistBoot(context, origin),
  );
  const scriptUrl = resolveAssistScriptUrl(origin);

  const visitorIdentity =
    context === 'app' && sessionUserId
      ? await loadAssistVisitorIdentity(sessionUserId).catch(() => null)
      : null;

  return NextResponse.json({
    context,
    scriptUrl,
    config,
    ...(visitorIdentity
      ? {
          visitorIdentity: {
            userId: visitorIdentity.userId,
            email: visitorIdentity.email,
            name: visitorIdentity.name,
            plan: visitorIdentity.plan,
          },
        }
      : {}),
  });
}
