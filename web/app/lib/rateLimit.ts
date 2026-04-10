/**
 * In-memory sliding window rate limiter for API routes.
 * Tracks requests per IP (or per user if authenticated).
 */

interface RateLimitEntry {
  timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      // Remove entries with no recent timestamps
      entry.timestamps = entry.timestamps.filter(t => now - t < 120000)
      if (entry.timestamps.length === 0) store.delete(key)
    }
  }, 5 * 60 * 1000)
}

interface RateLimitConfig {
  /** Max requests in the window */
  limit: number
  /** Window size in milliseconds */
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter?: number // seconds
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  let entry = store.get(key)

  if (!entry) {
    entry = { timestamps: [] }
    store.set(key, entry)
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs)

  if (entry.timestamps.length >= config.limit) {
    const oldestInWindow = entry.timestamps[0]
    const retryAfter = Math.ceil((oldestInWindow + config.windowMs - now) / 1000)
    return { allowed: false, remaining: 0, retryAfter }
  }

  entry.timestamps.push(now)
  return { allowed: true, remaining: config.limit - entry.timestamps.length }
}

/** Helper to get client IP from Next.js request */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
}

/** Pre-configured rate limit profiles */
export const RATE_LIMITS = {
  auth: { limit: 5, windowMs: 60 * 1000 },         // 5/min
  agent: { limit: 30, windowMs: 60 * 1000 },        // 30/min
  storage: { limit: 60, windowMs: 60 * 1000 },      // 60/min
  crud: { limit: 120, windowMs: 60 * 1000 },        // 120/min
  public: { limit: 30, windowMs: 60 * 1000 },       // 30/min (catalog, shared)
} as const

/** Apply rate limit and return 429 response if exceeded. Returns null if allowed. */
export function rateLimitResponse(key: string, config: RateLimitConfig): Response | null {
  const result = checkRateLimit(key, config)
  if (!result.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(result.retryAfter || 60),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }
  return null
}
