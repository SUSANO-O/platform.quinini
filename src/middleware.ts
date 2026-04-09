/**
 * Next.js Middleware — protect /dashboard/* routes
 * Runs on Edge runtime: only checks cookie presence.
 * Actual token verification happens in API routes and client-side AuthProvider.
 */

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/dashboard') && !pathname.startsWith('/admin')) return NextResponse.next();

  const token = request.cookies.get('afhub_session')?.value;
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
