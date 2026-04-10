import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const session = request.cookies.get('admin_session')
  const { pathname } = request.nextUrl

  // Allow auth routes, all API routes, and static assets
  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/icon.svg'
  ) {
    return NextResponse.next()
  }

  // No session → redirect to sign in
  if (!session?.value) {
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.svg|icon.svg).*)'],
}
