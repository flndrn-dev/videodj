/**
 * Shared environment variable loader for production (Dokploy/Docker) and local dev.
 *
 * In production: reads from process.env (set by Dockerfile / Dokploy).
 * In local dev: falls back to reading ../.env file from filesystem.
 */

const ENV_KEYS = [
  'AGENT_MODE', 'AGENT_PROVIDER', 'AGENT_API_KEY', 'CLAUDE_API_KEY',
  'AGENT_ENDPOINT', 'AGENT_MODEL',
  'YOUTUBE_API_KEY',
  'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_REDIRECT_URI',
  'TWITCH_STREAM_KEY', 'YOUTUBE_STREAM_KEY',
]

export function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}

  // Primary: read from process.env (Docker / Dokploy)
  for (const key of ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key]!
  }

  // If process.env had values, use them
  if (Object.keys(env).length > 0) return env

  // Fallback: read from filesystem (local dev only)
  try {
    const path = require('path')
    const fs = require('fs')
    const candidates = [
      path.resolve(process.cwd(), '../.env'),
      path.resolve(process.cwd(), '.env'),
      '/tmp/agent.env',
    ]
    for (const envPath of candidates) {
      if (fs.existsSync(envPath)) {
        const lines: string[] = fs.readFileSync(envPath, 'utf8').split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx === -1) continue
          env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
        }
        break
      }
    }
  } catch {
    // Filesystem not available (edge runtime, etc.)
  }

  return env
}

/**
 * Write env values to filesystem AND update process.env in-memory.
 * Used by the settings API so changes take effect immediately.
 */
export function writeEnv(updates: Record<string, string>): void {
  // Always update process.env in-memory so other routes pick up changes immediately
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) process.env[key] = value
  }

  // Persist to filesystem for durability (survives within container lifetime)
  try {
    const path = require('path')
    const fs = require('fs')
    const candidates = [
      path.resolve(process.cwd(), '../.env'),
      '/tmp/agent.env',
    ]

    let envPath = candidates[candidates.length - 1] // default to /tmp
    for (const p of candidates) {
      try {
        fs.accessSync(path.dirname(p), fs.constants.W_OK)
        envPath = p
        break
      } catch { /* not writable, try next */ }
    }

    // Read existing, merge updates, write back
    const existing: Record<string, string> = {}
    if (fs.existsSync(envPath)) {
      const lines: string[] = fs.readFileSync(envPath, 'utf8').split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx === -1) continue
        existing[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
      }
    }

    const merged = { ...existing, ...updates }
    const content = Object.entries(merged)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    fs.writeFileSync(envPath, content + '\n')
  } catch {
    // Filesystem write failed — in-memory update still applies
  }
}
