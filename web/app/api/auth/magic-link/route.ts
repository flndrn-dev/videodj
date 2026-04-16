import { NextResponse } from 'next/server'

// The shared magic-link endpoint was split into /api/auth/magic-link/desktop
// and /api/auth/magic-link/web. Any code still hitting this URL is stale and
// must be updated, so we refuse rather than silently picking a client.
export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint was removed. Use /api/auth/magic-link/desktop or /api/auth/magic-link/web.',
    },
    { status: 410 }
  )
}
