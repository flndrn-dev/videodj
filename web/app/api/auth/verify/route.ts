import { NextResponse } from 'next/server'

// The shared verify endpoint was split into /api/auth/verify/desktop and
// /api/auth/verify/web so tokens cannot be redeemed against the wrong
// product. This stub exists only so stale bookmarks don't silently sign
// anyone in with whatever scope. It points the user at the Web App.
export async function GET() {
  return NextResponse.redirect(
    new URL('/login?error=split-auth', process.env.NEXT_PUBLIC_BASE_URL || 'https://app.videodj.studio'),
    { status: 307 }
  )
}
