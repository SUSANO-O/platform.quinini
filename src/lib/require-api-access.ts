import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Subscription } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { canUseApiAccess } from '@/lib/plan-catalog';

const COOKIE = 'afhub_session';

function resolveUserId(req: NextRequest): string | null {
  const cookieToken = req.cookies.get(COOKIE)?.value;
  if (cookieToken) {
    const fromCookie = verifySessionToken(cookieToken);
    if (fromCookie) return fromCookie;
  }

  const bridgeToken = req.nextUrl.searchParams.get('session');
  if (bridgeToken) {
    return verifySessionToken(bridgeToken);
  }

  return null;
}

function htmlAuthError(status: 401 | 403, message: string): NextResponse {
  const body = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>API docs</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#334155"><h1 style="font-size:18px">${status === 401 ? 'Sesión requerida' : 'Acceso no disponible'}</h1><p>${message}</p></body></html>`;
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function requireApiAccessRequest(
  req: NextRequest,
): Promise<NextResponse | null> {
  const wantsHtml = (req.headers.get('accept') ?? '').includes('text/html');
  const userId = resolveUserId(req);

  if (!userId) {
    return wantsHtml
      ? htmlAuthError(401, 'Inicia sesión en el panel BotIvA y vuelve a abrir esta página.')
      : NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  await connectDB();
  const sub = (await Subscription.findOne({ userId }).lean()) as {
    plan?: string;
    status?: string;
    features?: string[];
  } | null;

  if (!canUseApiAccess(sub?.plan ?? 'free', sub?.status ?? 'free', sub?.features)) {
    return wantsHtml
      ? htmlAuthError(403, 'Tu plan no incluye API REST. Contrata API Develop o el add-on api_access (Team+).')
      : NextResponse.json(
          { error: 'API Develop o add-on api_access requerido' },
          { status: 403 },
        );
  }

  return null;
}
