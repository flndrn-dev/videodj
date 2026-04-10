import { NextRequest, NextResponse } from 'next/server'
import { loadEnv } from '@/app/lib/loadEnv'

/**
 * Twitch OAuth flow for videoDJ.Studio
 *
 * Flow:
 * 1. Frontend redirects to GET /api/twitch?action=login
 * 2. That redirects to Twitch OAuth with our client ID
 * 3. Twitch redirects back to GET /api/twitch?code=...
 * 4. We exchange the code for an access token
 * 5. We get the user's channel info and stream key
 *
 * Required env vars (set in Dokploy):
 * - TWITCH_CLIENT_ID
 * - TWITCH_CLIENT_SECRET
 */

// Scopes needed: chat, stream key, channel management, schedule
const TWITCH_SCOPES = [
  'chat:read',
  'chat:edit',
  'channel:read:stream_key',
  'channel:manage:broadcast',
  'channel:manage:schedule',
  'user:read:email',
].join(' ')

export async function GET(req: NextRequest) {
  const env = loadEnv()
  const clientId = env.TWITCH_CLIENT_ID || ''
  const clientSecret = env.TWITCH_CLIENT_SECRET || ''

  // ALWAYS derive redirect URI from the request — never use .env value
  // This ensures it works on any domain (localhost, app.videodj.studio, etc.)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const redirectUri = `${baseUrl}/api/twitch`

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  // Step 1: Redirect to Twitch OAuth
  if (action === 'login') {
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'TWITCH_CLIENT_ID not set in .env' })
    }
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(TWITCH_SCOPES)}`
    return NextResponse.redirect(authUrl)
  }

  // Handle OAuth error
  if (error) {
    return NextResponse.redirect(`${baseUrl}?twitch_error=${encodeURIComponent(error)}`)
  }

  // Step 2: Exchange code for token
  if (code) {
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${baseUrl}?twitch_error=missing_credentials`)
    }

    try {
      // Exchange code for access token
      const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      })

      if (!tokenRes.ok) {
        return NextResponse.redirect(`${baseUrl}?twitch_error=token_exchange_failed`)
      }

      const tokenData = await tokenRes.json()
      const accessToken = tokenData.access_token

      // Get user info
      const userRes = await fetch('https://api.twitch.tv/helix/users', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': clientId,
        },
      })
      const userData = await userRes.json()
      const user = userData.data?.[0]

      // Get stream key
      let streamKey = ''
      if (user?.id) {
        const keyRes = await fetch(`https://api.twitch.tv/helix/streams/key?broadcaster_id=${user.id}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': clientId,
          },
        })
        const keyData = await keyRes.json()
        streamKey = keyData.data?.[0]?.stream_key || ''
      }

      // Redirect back to app with data as URL params (stored in localStorage by frontend)
      const params = new URLSearchParams({
        twitch_connected: 'true',
        twitch_username: user?.display_name || user?.login || '',
        twitch_channel: user?.login || '',
        twitch_token: accessToken,
        twitch_stream_key: streamKey,
        twitch_user_id: user?.id || '',
      })

      return NextResponse.redirect(`${baseUrl}?${params.toString()}`)
    } catch (e) {
      return NextResponse.redirect(`${baseUrl}?twitch_error=${encodeURIComponent((e as Error).message)}`)
    }
  }

  // Status check
  return NextResponse.json({ success: true, hasClientId: !!clientId })
}

/**
 * POST /api/twitch — Channel management actions
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, token, broadcasterId } = body
    const env = loadEnv()
    const clientId = env.TWITCH_CLIENT_ID || ''
    const helixHeaders = {
      'Authorization': `Bearer ${token}`,
      'Client-Id': clientId,
      'Content-Type': 'application/json',
    }

    // --- Send chat message ---
    if (action === 'send-chat') {
      const { message } = body
      const userRes = await fetch('https://api.twitch.tv/helix/users', {
        headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': clientId },
      })
      const userData = await userRes.json()
      const senderId = userData.data?.[0]?.id
      if (!senderId) return NextResponse.json({ success: false, error: 'Could not get sender ID' })

      const chatRes = await fetch('https://api.twitch.tv/helix/chat/messages', {
        method: 'POST', headers: helixHeaders,
        body: JSON.stringify({ broadcaster_id: broadcasterId, sender_id: senderId, message }),
      })
      if (!chatRes.ok) return NextResponse.json({ success: false, error: await chatRes.text() })
      return NextResponse.json({ success: true })
    }

    // --- Update channel info (title, category, tags) ---
    if (action === 'update-channel') {
      const { title, gameId, tags } = body
      const patchBody: Record<string, unknown> = {}
      if (title) patchBody.title = title
      if (gameId) patchBody.game_id = gameId
      if (tags) patchBody.tags = tags

      const res = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
        method: 'PATCH', headers: helixHeaders,
        body: JSON.stringify(patchBody),
      })
      if (!res.ok) return NextResponse.json({ success: false, error: await res.text() })
      return NextResponse.json({ success: true })
    }

    // --- Get channel info ---
    if (action === 'get-channel') {
      const res = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': clientId },
      })
      if (!res.ok) return NextResponse.json({ success: false, error: await res.text() })
      const data = await res.json()
      return NextResponse.json({ success: true, channel: data.data?.[0] })
    }

    // --- Search categories (for the category picker) ---
    if (action === 'search-categories') {
      const { query } = body
      const res = await fetch(`https://api.twitch.tv/helix/search/categories?query=${encodeURIComponent(query)}&first=10`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': clientId },
      })
      if (!res.ok) return NextResponse.json({ success: false, error: await res.text() })
      const data = await res.json()
      return NextResponse.json({ success: true, categories: data.data || [] })
    }

    // --- Get stream schedule ---
    if (action === 'get-schedule') {
      const res = await fetch(`https://api.twitch.tv/helix/schedule?broadcaster_id=${broadcasterId}&first=10`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': clientId },
      })
      if (!res.ok) return NextResponse.json({ success: false, error: await res.text() })
      const data = await res.json()
      return NextResponse.json({ success: true, schedule: data.data })
    }

    // --- Create stream schedule segment ---
    if (action === 'create-schedule') {
      const { startTime, duration, title: segTitle, isRecurring, timezone } = body
      const res = await fetch(`https://api.twitch.tv/helix/schedule/segment?broadcaster_id=${broadcasterId}`, {
        method: 'POST', headers: helixHeaders,
        body: JSON.stringify({
          start_time: startTime,
          timezone: timezone || 'UTC',
          duration: duration || '120',
          is_recurring: isRecurring || false,
          title: segTitle || 'DJ Set',
        }),
      })
      if (!res.ok) return NextResponse.json({ success: false, error: await res.text() })
      return NextResponse.json({ success: true })
    }

    // --- Delete schedule segment ---
    if (action === 'delete-schedule') {
      const { segmentId } = body
      const res = await fetch(`https://api.twitch.tv/helix/schedule/segment?broadcaster_id=${broadcasterId}&id=${segmentId}`, {
        method: 'DELETE', headers: helixHeaders,
      })
      if (!res.ok) return NextResponse.json({ success: false, error: await res.text() })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: 'Unknown action' })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message })
  }
}
