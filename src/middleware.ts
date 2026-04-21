import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const LANDING_PATHS = new Set(['/', '/es', '/en']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth protection — runs before i18n
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    const token = request.cookies.get('afhub_session')?.value;
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
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
  matcher: ['/', '/es', '/en', '/es/:path*', '/en/:path*', '/dashboard/:path*', '/admin/:path*'],
};
