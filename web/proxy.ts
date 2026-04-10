import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const session = request.cookies.get('videodj_session')
  const { pathname } = request.nextUrl

  // Allow public routes, API, and static assets
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/icon.svg' ||
    pathname === '/login'
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
