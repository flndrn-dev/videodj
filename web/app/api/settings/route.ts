import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

const ENV_PATH = path.resolve(process.cwd(), '../.env')

function readEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  if (!fs.existsSync(ENV_PATH)) return env
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }
  return env
}

function writeEnv(env: Record<string, string>): void {
  const lines = [
    '# videoDJ.Studio — Environment Variables',
    '# NEVER commit this file — it is in .gitignore',
    '',
    `# Agent provider: "claude" (API key), "cli" (Claude CLI Pro+), "mock" (demo)`,
    `AGENT_PROVIDER=${env.AGENT_PROVIDER || 'claude'}`,
    '',
    '# Claude API key — get one at https://console.anthropic.com',
    `CLAUDE_API_KEY=${env.CLAUDE_API_KEY || 'your-api-key-here'}`,
    '',
    '# Agent model',
    `AGENT_MODEL=${env.AGENT_MODEL || 'claude-3-haiku-20240307'}`,
    '',
  ]

  // Twitch credentials (only write if set)
  if (env.TWITCH_CLIENT_ID) {
    lines.push('# Twitch — get credentials at https://dev.twitch.tv/console/apps')
    lines.push(`TWITCH_CLIENT_ID=${env.TWITCH_CLIENT_ID}`)
    lines.push(`TWITCH_CLIENT_SECRET=${env.TWITCH_CLIENT_SECRET || ''}`)
    lines.push(`TWITCH_REDIRECT_URI=${env.TWITCH_REDIRECT_URI || 'http://localhost:3030/api/twitch'}`)
    lines.push('')
  }

  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf8')
}

// GET — return current settings (mask the API key)
export async function GET() {
  const env = readEnv()
  const apiKey = env.CLAUDE_API_KEY || ''
  const hasKey = apiKey.length > 10 && apiKey !== 'your-api-key-here'

  return NextResponse.json({
    provider: env.AGENT_PROVIDER || 'mock',
    model: env.AGENT_MODEL || 'claude-3-haiku-20240307',
    hasApiKey: hasKey,
    apiKeyMasked: hasKey ? `${apiKey.slice(0, 12)}...${apiKey.slice(-4)}` : '',
  })
}

// POST — save settings (API key, provider, model)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const env = readEnv()

    if (body.CLAUDE_API_KEY !== undefined) {
      env.CLAUDE_API_KEY = body.CLAUDE_API_KEY
    }
    if (body.AGENT_PROVIDER !== undefined) {
      env.AGENT_PROVIDER = body.AGENT_PROVIDER
    }
    if (body.AGENT_MODEL !== undefined) {
      env.AGENT_MODEL = body.AGENT_MODEL
    }
    if (body.TWITCH_CLIENT_ID !== undefined) {
      env.TWITCH_CLIENT_ID = body.TWITCH_CLIENT_ID
    }
    if (body.TWITCH_CLIENT_SECRET !== undefined) {
      env.TWITCH_CLIENT_SECRET = body.TWITCH_CLIENT_SECRET
    }
    if (body.TWITCH_REDIRECT_URI !== undefined) {
      env.TWITCH_REDIRECT_URI = body.TWITCH_REDIRECT_URI
    }

    writeEnv(env)

    // If Twitch credentials were saved, return success immediately (OAuth will redirect)
    if (body.TWITCH_CLIENT_ID) {
      return NextResponse.json({ success: true, saved: true })
    }

    // Test the API key if one was provided
    if (body.CLAUDE_API_KEY && body.CLAUDE_API_KEY !== 'your-api-key-here') {
      const testRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': body.CLAUDE_API_KEY,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: env.AGENT_MODEL || 'claude-3-haiku-20240307',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })

      if (testRes.ok) {
        return NextResponse.json({ success: true, connected: true })
      } else {
        const err = await testRes.json().catch(() => ({}))
        return NextResponse.json({
          success: true,
          connected: false,
          error: (err as Record<string, Record<string, string>>)?.error?.message || `API returned ${testRes.status}`,
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}
