import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const session = request.cookies.get('videodj_session')
  const { pathname } = request.nextUrl

  // Allow public routes, API, and static assets. Both auth flows — the web
  // /login + /signup and the Desktop-only /desktop/login + /desktop/signup —
  // must be reachable without a session, otherwise the middleware bounces
  // unauthenticated users into a redirect loop (Electron's will-navigate
  // guard rewrites /login to /desktop/login, and vice versa).
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/icon.svg' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/desktop/login' ||
    pathname === '/desktop/signup'
  ) {
    return NextResponse.next()
  }

  // No session → redirect to app login page
  if (!session?.value) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.svg|icon.svg).*)'],
}
