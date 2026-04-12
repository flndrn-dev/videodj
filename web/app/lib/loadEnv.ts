/**
 * Shared environment variable loader for production (Dokploy/Docker) and local dev.
 *
 * Priority order:
 * 1. PostgreSQL app_settings table (user-changed settings persist across deploys)
 * 2. process.env (set by Dockerfile / Dokploy — initial defaults)
 * 3. Filesystem .env file (local dev fallback)
 */

import pg from 'pg'

const ENV_KEYS = [
  'AGENT_MODE', 'AGENT_PROVIDER', 'AGENT_API_KEY', 'CLAUDE_API_KEY',
  'AGENT_ENDPOINT', 'AGENT_MODEL',
  'YOUTUBE_API_KEY',
  'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_REDIRECT_URI',
  'TWITCH_STREAM_KEY', 'YOUTUBE_STREAM_KEY',
]

// Cache DB settings in-memory to avoid hitting DB on every request
let dbCache: Record<string, string> | null = null
let dbCacheTime = 0
const DB_CACHE_TTL = 5000 // 5 seconds

async function getPool() {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 2,
  })
}

/** Load settings from PostgreSQL app_settings table */
async function loadFromDB(): Promise<Record<string, string>> {
  if (dbCache && Date.now() - dbCacheTime < DB_CACHE_TTL) return dbCache

  try {
    const pool = await getPool()
    const result = await pool.query('SELECT key, value FROM app_settings')
    await pool.end()
    const settings: Record<string, string> = {}
    for (const row of result.rows) {
      settings[row.key] = row.value
    }
    dbCache = settings
    dbCacheTime = Date.now()
    return settings
  } catch {
    return {}
  }
}

/** Save settings to PostgreSQL app_settings table */
async function saveToDB(updates: Record<string, string>): Promise<void> {
  try {
    const pool = await getPool()
    for (const [key, value] of Object.entries(updates)) {
      if (!ENV_KEYS.includes(key)) continue
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value]
      )
    }
    await pool.end()
    // Invalidate cache
    dbCache = null
  } catch (err) {
    console.warn('[loadEnv] Failed to save to DB:', err)
  }
}

export async function loadEnvAsync(): Promise<Record<string, string>> {
  const env: Record<string, string> = {}

  // Layer 1: process.env defaults (Dokploy/Docker)
  for (const key of ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key]!
  }

  // Layer 2: Filesystem .env (local dev)
  if (Object.keys(env).length === 0) {
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
    } catch { /* edge runtime */ }
  }

  // Layer 3: PostgreSQL overrides (user-changed settings WIN over defaults)
  const dbSettings = await loadFromDB()
  for (const [key, value] of Object.entries(dbSettings)) {
    if (value) env[key] = value
  }

  return env
}

/** Synchronous version — uses cached DB values, falls back to process.env */
export function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}

  // process.env first
  for (const key of ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key]!
  }

  // Filesystem fallback (local dev)
  if (Object.keys(env).length === 0) {
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
    } catch { /* edge runtime */ }
  }

  // DB cache overlay (if available)
  if (dbCache) {
    for (const [key, value] of Object.entries(dbCache)) {
      if (value) env[key] = value
    }
  }

  return env
}

/**
 * Write env values to PostgreSQL + process.env + filesystem.
 * PostgreSQL is the source of truth for user-changed settings.
 */
export async function writeEnvAsync(updates: Record<string, string>): Promise<void> {
  // Update process.env in-memory
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) process.env[key] = value
  }

  // Save to PostgreSQL (survives container restarts and deploys)
  await saveToDB(updates)

  // Also persist to filesystem as backup
  try {
    const path = require('path')
    const fs = require('fs')
    const candidates = [
      path.resolve(process.cwd(), '../.env'),
      '/tmp/agent.env',
    ]
    let envPath = candidates[candidates.length - 1]
    for (const p of candidates) {
      try {
        fs.accessSync(path.dirname(p), fs.constants.W_OK)
        envPath = p
        break
      } catch { /* not writable */ }
    }
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
  } catch { /* filesystem write failed — DB is source of truth */ }
}

/** Legacy sync wrapper — kept for backward compatibility */
export function writeEnv(updates: Record<string, string>): void {
  // Update process.env immediately
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) process.env[key] = value
  }
  // Fire async DB save (don't await)
  saveToDB(updates).catch(() => {})
}
