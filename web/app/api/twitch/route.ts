import { NextRequest, NextResponse } from 'next/server'

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
 * Required env vars:
 * - TWITCH_CLIENT_ID
 * - TWITCH_CLIENT_SECRET
 * - TWITCH_REDIRECT_URI (defaults to http://localhost:3030/api/twitch)
 */

import path from 'path'
import fs from 'fs'

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '../.env')
  const env: Record<string, string> = {}
  if (!fs.existsSync(envPath)) return env
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }
  return env
}

// Scopes needed: read chat, send chat, read stream key
const TWITCH_SCOPES = [
  'chat:read',
  'chat:edit',
  'channel:read:stream_key',
  'user:read:email',
].join(' ')

export async function GET(req: NextRequest) {
  const env = loadEnv()
  const clientId = env.TWITCH_CLIENT_ID || ''
  const clientSecret = env.TWITCH_CLIENT_SECRET || ''
  const redirectUri = env.TWITCH_REDIRECT_URI || 'http://localhost:3030/api/twitch'

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
    // Redirect back to app with error
    return NextResponse.redirect(`http://localhost:3030?twitch_error=${encodeURIComponent(error)}`)
  }

  // Step 2: Exchange code for token
  if (code) {
    if (!clientId || !clientSecret) {
      return NextResponse.redirect('http://localhost:3030?twitch_error=missing_credentials')
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
        return NextResponse.redirect('http://localhost:3030?twitch_error=token_exchange_failed')
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

      return NextResponse.redirect(`http://localhost:3030?${params.toString()}`)
    } catch (e) {
      return NextResponse.redirect(`http://localhost:3030?twitch_error=${encodeURIComponent((e as Error).message)}`)
    }
  }

  // Status check
  return NextResponse.json({ success: true, hasClientId: !!clientId })
}

/**
 * POST /api/twitch — Send a chat message
 */
export async function POST(req: NextRequest) {
  try {
    const { action, token, broadcasterId, message } = await req.json()
    const env = loadEnv()
    const clientId = env.TWITCH_CLIENT_ID || ''

    if (action === 'send-chat' && token && broadcasterId && message) {
      // Get sender user ID
      const userRes = await fetch('https://api.twitch.tv/helix/users', {
        headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': clientId },
      })
      const userData = await userRes.json()
      const senderId = userData.data?.[0]?.id

      if (!senderId) {
        return NextResponse.json({ success: false, error: 'Could not get sender ID' })
      }

      // Send chat message via Helix API
      const chatRes = await fetch('https://api.twitch.tv/helix/chat/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id': clientId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          broadcaster_id: broadcasterId,
          sender_id: senderId,
          message,
        }),
      })

      if (!chatRes.ok) {
        const err = await chatRes.text()
        return NextResponse.json({ success: false, error: err })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: 'Unknown action' })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message })
  }
}
