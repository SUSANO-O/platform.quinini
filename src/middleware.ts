import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const LANDING_PATHS = new Set(['/', '/es', '/en']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Servicio "solo landing": no sirve la app. /dashboard y /admin se van a la plataforma.
  if (process.env.LANDING_ONLY === '1' && (pathname.startsWith('/dashboard') || pathname.startsWith('/admin'))) {
    const appBase = (process.env.APP_PUBLIC_URL || 'https://app.botiva.space').replace(/\/$/, '');
    return NextResponse.redirect(`${appBase}${pathname}${request.nextUrl.search}`);
  }

  // Auth protection — runs before i18n
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    const token = request.cookies.get('afhub_session')?.value;
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      // Conserva query (p. ej. ?id=… en widget-preview) para volver tras el login.
      loginUrl.searchParams.set('from', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/embed/afapi')) {
    const token = request.cookies.get('afhub_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // i18n routing only for landing routes
  if (LANDING_PATHS.has(pathname) || pathname.startsWith('/es/') || pathname.startsWith('/en/')) {
    return intlMiddleware(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/es',
    '/en',
    '/es/:path*',
    '/en/:path*',
    '/dashboard/:path*',
    '/admin/:path*',
    '/api/embed/afapi/:path*',
  ],
};
