import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import {
  resolveAssistScriptUrl,
  resolveInternalAssistBoot,
  type InternalAssistContext,
} from '@/lib/internal-assist-config';
import { enrichInternalAssistWithWidget } from '@/lib/internal-assist-widget';

function parseContext(raw: string | null): InternalAssistContext {
  return raw === 'marketing' ? 'marketing' : 'app';
}

/**
 * GET /api/internal/assist/boot?context=app|marketing
 * Config del asistente interno (solo usuarios autenticados en dashboard;
 * marketing permite acceso público con config no sensible).
 */
export async function GET(req: NextRequest) {
  const context = parseContext(req.nextUrl.searchParams.get('context'));
  const origin = req.nextUrl.origin;

  if (context === 'app') {
    const token = req.cookies.get('afhub_session')?.value;
    const userId = token ? verifySessionToken(token) : null;
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  const config = await enrichInternalAssistWithWidget(
    context,
    resolveInternalAssistBoot(context, origin),
  );
  const scriptUrl = resolveAssistScriptUrl(origin);

  return NextResponse.json({
    context,
    scriptUrl,
    config,
  });
}
