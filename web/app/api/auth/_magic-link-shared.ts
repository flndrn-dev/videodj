import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

// ---------------------------------------------------------------------------
// Shared internals for the per-client magic-link endpoints.
// There are two public routes that import from here:
//   - /api/auth/magic-link/desktop  -> emails a videodj:// deep link only
//   - /api/auth/magic-link/web      -> emails an https:// link only
// This file owns everything they share: rate limiting, DB access, Resend
// setup, validation. The public endpoints only pick their `client` value.
// ---------------------------------------------------------------------------

export type Client = 'desktop' | 'web'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 3,
  })
}

async function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  const { Resend } = await import('resend')
  return new Resend(process.env.RESEND_API_KEY)
}

const WEB_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.videodj.studio'

// Guarantee the `client` column exists. `ADD COLUMN IF NOT EXISTS` is
// idempotent, and we cache the result on the module so we only pay the round
// trip once per Node process.
let schemaEnsured = false
async function ensureSchema(pool: Awaited<ReturnType<typeof getPool>>) {
  if (schemaEnsured) return
  await pool.query(`ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS client TEXT`)
  schemaEnsured = true
}

// ---------------------------------------------------------------------------
// Rate Limiting — 5 requests per minute per IP
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 5
const RATE_WINDOW = 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip)
  }
}, 5 * 60 * 1000)

// ---------------------------------------------------------------------------
// Email rendering — separate templates per client, no cross-links
// ---------------------------------------------------------------------------

function buildUrl(client: Client, token: string): string {
  return client === 'desktop'
    ? `videodj://auth/verify?token=${token}`
    : `${WEB_BASE_URL}/api/auth/verify/web?token=${token}`
}

function renderEmail(opts: { client: Client; isSignup: boolean; url: string }) {
  const { client, isSignup, url } = opts
  const productLine = client === 'desktop' ? 'videoDJ.Studio Desktop App' : 'videoDJ.Studio Web App'
  const heading = isSignup
    ? `Welcome to ${productLine}`
    : `Sign in to ${productLine}`
  const buttonLabel = isSignup
    ? (client === 'desktop' ? 'Activate Desktop App' : 'Activate Web App')
    : (client === 'desktop' ? 'Open Desktop App' : 'Open Web App')

  const text = `${heading}\n\n${buttonLabel}: ${url}\n\nThis link expires in 15 minutes.${
    isSignup ? '' : `\n\nIf you didn't request this, you can safely ignore this email.`
  }`

  const html = `
    <div style="background:#14141f;color:#e8e8f2;padding:48px 32px;font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:rgba(255,255,0,0.12);border:1px solid rgba(255,255,0,0.2);border-radius:16px;padding:12px 16px;">
          <span style="color:#ffff00;font-size:24px;font-weight:bold;">V</span>
        </div>
      </div>
      <p style="color:#8a8aa5;font-size:11px;text-align:center;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px 0;">
        ${client === 'desktop' ? 'Desktop App' : 'Web App'}
      </p>
      <h1 style="color:#ffff00;font-size:20px;font-weight:600;text-align:center;margin-bottom:8px;">
        ${heading}
      </h1>
      <p style="color:#9898b8;font-size:14px;text-align:center;line-height:1.6;margin-bottom:32px;">
        ${isSignup ? 'Click below to activate your account.' : 'Click the button below to sign in.'} This link expires in 15 minutes.
      </p>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${url}" style="display:inline-block;background:#ffff00;color:#14141f;padding:14px 40px;border-radius:12px;font-weight:600;text-decoration:none;font-size:14px;">
          ${buttonLabel}
        </a>
      </div>
      <p style="color:#5a5a78;font-size:11px;text-align:center;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `

  return { text, html }
}

// ---------------------------------------------------------------------------
// The one POST handler both endpoints share — each endpoint passes in its
// hard-coded `client` value, so the product identity is set by the URL, not
// by anything in the request body.
// ---------------------------------------------------------------------------

export async function handleMagicLinkRequest(req: NextRequest, client: Client) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 })
    }

    const { email: rawEmail, mode } = await req.json()
    const email = (rawEmail || '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const pool = await getPool()
    await ensureSchema(pool)

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    let user = userResult.rows[0]

    if (user && user.status === 'disabled') {
      await pool.end()
      return NextResponse.json({ error: 'Account disabled. Contact admin.' }, { status: 403 })
    }

    if (!user && mode === 'signup') {
      const name = email.split('@')[0]
      const createResult = await pool.query(
        `INSERT INTO users (email, name, role, status) VALUES ($1, $2, 'subscriber', 'invited') RETURNING *`,
        [email, name]
      )
      user = createResult.rows[0]
    }

    if (!user) {
      await pool.end()
      return NextResponse.json({ error: 'No account found. Sign up first.' }, { status: 404 })
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    await pool.query(
      'INSERT INTO magic_links (email, token, expires_at, client) VALUES ($1, $2, $3, $4)',
      [email, token, expiresAt.toISOString(), client]
    )

    const url = buildUrl(client, token)
    const isSignup = mode === 'signup' && user.status === 'invited'
    const subject = isSignup
      ? `Welcome to videoDJ.Studio (${client === 'desktop' ? 'Desktop App' : 'Web App'})`
      : `Sign in to videoDJ.Studio (${client === 'desktop' ? 'Desktop App' : 'Web App'})`

    const resend = await getResend()
    if (resend) {
      const { text, html } = renderEmail({ client, isSignup, url })
      await resend.emails.send({
        from: 'videoDJ.Studio <noreply@videodj.studio>',
        to: email,
        subject,
        text,
        html,
      })
    }

    await pool.end()
    return NextResponse.json({ success: true, isNewUser: isSignup, client })
  } catch (err) {
    console.error(`Magic link (${client}) error:`, err)
    return NextResponse.json({ error: 'Failed to send sign-in link' }, { status: 500 })
  }
}
