import { NextRequest, NextResponse } from 'next/server'
import { loadEnv, writeEnv } from '@/app/lib/loadEnv'

// GET — return current settings
export async function GET() {
  const env = loadEnv()
  const apiKey = env.AGENT_API_KEY || env.CLAUDE_API_KEY || ''
  const hasKey = apiKey.length > 10 && apiKey !== 'your-api-key-here'

  return NextResponse.json({
    mode: env.AGENT_MODE || 'apikey',
    provider: env.AGENT_PROVIDER || 'anthropic',
    model: env.AGENT_MODEL || '',
    endpoint: env.AGENT_ENDPOINT || '',
    hasApiKey: hasKey,
    apiKeyMasked: hasKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : '',
    apiKeyFull: hasKey ? apiKey : '',
    twitchClientId: env.TWITCH_CLIENT_ID || '',
    twitchClientSecret: env.TWITCH_CLIENT_SECRET || '',
  })
}

// POST — save settings
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const env = loadEnv()

    if (body.AGENT_MODE !== undefined) env.AGENT_MODE = body.AGENT_MODE
    if (body.AGENT_PROVIDER !== undefined) env.AGENT_PROVIDER = body.AGENT_PROVIDER
    if (body.AGENT_API_KEY !== undefined) env.AGENT_API_KEY = body.AGENT_API_KEY
    if (body.AGENT_ENDPOINT !== undefined) env.AGENT_ENDPOINT = body.AGENT_ENDPOINT
    if (body.AGENT_MODEL !== undefined) env.AGENT_MODEL = body.AGENT_MODEL

    // Legacy support
    if (body.CLAUDE_API_KEY !== undefined) env.AGENT_API_KEY = body.CLAUDE_API_KEY

    // YouTube
    if (body.YOUTUBE_API_KEY !== undefined) env.YOUTUBE_API_KEY = body.YOUTUBE_API_KEY

    // Twitch
    if (body.TWITCH_CLIENT_ID !== undefined) env.TWITCH_CLIENT_ID = body.TWITCH_CLIENT_ID
    if (body.TWITCH_CLIENT_SECRET !== undefined) env.TWITCH_CLIENT_SECRET = body.TWITCH_CLIENT_SECRET
    if (body.TWITCH_REDIRECT_URI !== undefined) env.TWITCH_REDIRECT_URI = body.TWITCH_REDIRECT_URI

    try {
      writeEnv(env)
    } catch (writeErr) {
      console.warn('[settings] Could not persist .env file:', (writeErr as Error).message)
      // Non-fatal — continue with the API key test
    }

    // If Twitch credentials, return immediately
    if (body.TWITCH_CLIENT_ID) {
      return NextResponse.json({ success: true, saved: true })
    }

    // Test Claude CLI subscription
    if (body.AGENT_MODE === 'subscription') {
      const cliResult = await testClaudeCLI()
      return NextResponse.json({ success: true, ...cliResult })
    }

    // Test the API key if provided
    const apiKey = body.AGENT_API_KEY || body.CLAUDE_API_KEY
    const provider = body.AGENT_PROVIDER || env.AGENT_PROVIDER || 'anthropic'
    if (apiKey && apiKey.length > 10) {
      const testResult = await testApiKey(provider, apiKey, body.AGENT_ENDPOINT, body.AGENT_MODEL)
      return NextResponse.json({ success: true, ...testResult })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}

// Test Claude CLI (subscription mode)
async function testClaudeCLI(): Promise<{ connected: boolean; error?: string; cliVersion?: string }> {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const exec = promisify(execFile)

  // Find claude binary
  const paths = ['/usr/local/bin/claude', '/opt/homebrew/bin/claude']
  let claudePath = ''
  const fsSync = await import('fs')
  for (const p of paths) {
    if (fsSync.existsSync(p)) { claudePath = p; break }
  }
  if (!claudePath) {
    // Try PATH
    try {
      const { stdout } = await exec('which', ['claude'])
      claudePath = stdout.trim()
    } catch {
      return { connected: false, error: 'Claude CLI not found. Install it: npm install -g @anthropic-ai/claude-code' }
    }
  }

  // Test with a simple prompt
  try {
    const { stdout } = await exec(claudePath, ['--print', '--max-turns', '1'], {
      timeout: 15000,
      env: { ...process.env, CLAUDE_CODE_MAX_TOKENS: '20' },
    })
    // If we get any output, the CLI is authenticated and working
    if (stdout && stdout.trim().length > 0) {
      // Get version
      let version = ''
      try {
        const { stdout: vOut } = await exec(claudePath, ['--version'], { timeout: 5000 })
        version = vOut.trim()
      } catch { /* ignore */ }
      return { connected: true, cliVersion: version }
    }
    return { connected: false, error: 'CLI returned empty response. Run "claude login" in your terminal.' }
  } catch (e) {
    const msg = (e as Error).message || ''
    if (msg.includes('EPERM') || msg.includes('EACCES')) {
      return { connected: false, error: 'Permission denied. Check CLI permissions.' }
    }
    if (msg.includes('timeout')) {
      return { connected: false, error: 'CLI timed out. Run "claude login" in your terminal first.' }
    }
    return { connected: false, error: `CLI test failed: ${msg.slice(0, 100)}` }
  }
}

// Test API key against the selected provider
async function testApiKey(provider: string, apiKey: string, endpoint?: string, model?: string): Promise<{ connected: boolean; error?: string }> {
  try {
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: model || 'claude-sonnet-4-20250514', max_tokens: 10, messages: [{ role: 'user', content: 'ping' }] }),
      })
      if (res.ok) return { connected: true }
      const err = await res.json().catch(() => ({}))
      return { connected: false, error: (err as Record<string, Record<string, string>>)?.error?.message || `Status ${res.status}` }
    }

    // Ollama — uses its own API, not OpenAI-compatible for validation
    if (provider === 'ollama') {
      const baseUrl = (endpoint || 'http://187.124.64.116:11434').replace(/\/+$/, '')
      try {
        // Test with /api/tags (list models)
        const tagsRes = await fetch(`${baseUrl}/api/tags`)
        if (!tagsRes.ok) return { connected: false, error: `Ollama unreachable: ${tagsRes.status}` }
        const tags = await tagsRes.json()
        const modelName = model || 'qwen2.5-coder:14b'
        const available = tags.models?.map((m: { name: string }) => m.name) || []
        if (available.length === 0) return { connected: false, error: 'Ollama running but no models installed' }
        if (!available.some((m: string) => m.includes(modelName.split(':')[0]))) {
          return { connected: false, error: `Model "${modelName}" not found. Available: ${available.join(', ')}` }
        }
        return { connected: true }
      } catch (e) {
        return { connected: false, error: `Cannot reach Ollama: ${(e as Error).message}` }
      }
    }

    // OpenAI-compatible providers (OpenAI, xAI, DeepSeek, Google, Custom)
    const endpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions',
      xai: 'https://api.x.ai/v1/chat/completions',
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    }
    const defaults: Record<string, string> = {
      openai: 'gpt-4o',
      xai: 'grok-3',
      deepseek: 'deepseek-chat',
      google: 'gemini-2.5-pro',
    }

    const url = endpoint || endpoints[provider] || endpoint
    if (!url) return { connected: false, error: 'No endpoint URL provided' }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || defaults[provider] || 'gpt-4o', max_tokens: 10, messages: [{ role: 'user', content: 'ping' }] }),
    })
    if (res.ok) return { connected: true }
    const err = await res.json().catch(() => ({}))
    return { connected: false, error: (err as Record<string, Record<string, string>>)?.error?.message || `Status ${res.status}` }
  } catch (e) {
    return { connected: false, error: (e as Error).message }
  }
}
