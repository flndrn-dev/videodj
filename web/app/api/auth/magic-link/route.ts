import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

// Use dynamic import to avoid @types/pg issue in build
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

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.videodj.studio'

// ---------------------------------------------------------------------------
// Rate Limiting — 5 requests per minute per IP
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 5
const RATE_WINDOW = 60 * 1000 // 1 minute

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

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip)
  }
}, 5 * 60 * 1000)

// ---------------------------------------------------------------------------
// POST — Send magic link (sign in or sign up)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP
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

    // Check if user exists
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    let user = userResult.rows[0]

    if (user && user.status === 'disabled') {
      await pool.end()
      return NextResponse.json({ error: 'Account disabled. Contact admin.' }, { status: 403 })
    }

    // Self-service signup: if user doesn't exist and mode is 'signup', create them
    if (!user && mode === 'signup') {
      const name = email.split('@')[0] // Default name from email
      const createResult = await pool.query(
        `INSERT INTO users (email, name, role, status) VALUES ($1, $2, 'subscriber', 'invited') RETURNING *`,
        [email, name]
      )
      user = createResult.rows[0]
    }

    // For login mode, require existing account
    if (!user) {
      await pool.end()
      return NextResponse.json({ error: 'No account found. Sign up first at /signup' }, { status: 404 })
    }

    // Create magic link token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    await pool.query(
      'INSERT INTO magic_links (email, token, expires_at) VALUES ($1, $2, $3)',
      [email, token, expiresAt.toISOString()]
    )

    const magicUrl = `${BASE_URL}/api/auth/verify?token=${token}`
    const isSignup = mode === 'signup' && user.status === 'invited'

    // Send email via Resend
    const resend = await getResend()
    if (resend) {
      await resend.emails.send({
        from: 'videoDJ.Studio <noreply@videodj.studio>',
        to: email,
        subject: isSignup ? 'Welcome to videoDJ.Studio' : 'Sign in to videoDJ.Studio',
        text: isSignup
          ? `Welcome to videoDJ.Studio\n\nClick this link to activate your account: ${magicUrl}\n\nThis link expires in 15 minutes.`
          : `Sign in to videoDJ.Studio\n\nClick this link to sign in: ${magicUrl}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
        html: `
          <div style="background:#14141f;color:#e8e8f2;padding:48px 32px;font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;">
            <div style="text-align:center;margin-bottom:32px;">
              <div style="display:inline-block;background:rgba(255,255,0,0.12);border:1px solid rgba(255,255,0,0.2);border-radius:16px;padding:12px 16px;">
                <span style="color:#ffff00;font-size:24px;font-weight:bold;">V</span>
              </div>
            </div>
            <h1 style="color:#ffff00;font-size:20px;font-weight:600;text-align:center;margin-bottom:8px;">
              ${isSignup ? 'Welcome to videoDJ.Studio' : 'Sign in to videoDJ.Studio'}
            </h1>
            <p style="color:#9898b8;font-size:14px;text-align:center;line-height:1.6;margin-bottom:32px;">
              ${isSignup ? 'Click below to activate your account.' : 'Click the button below to sign in.'} This link expires in 15 minutes.
            </p>
            <div style="text-align:center;margin-bottom:32px;">
              <a href="${magicUrl}" style="display:inline-block;background:#ffff00;color:#14141f;padding:14px 40px;border-radius:12px;font-weight:600;text-decoration:none;font-size:14px;">
                ${isSignup ? 'Activate Account' : 'Sign In'}
              </a>
            </div>
            <p style="color:#5a5a78;font-size:11px;text-align:center;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      })
    }

    await pool.end()
    return NextResponse.json({ success: true, isNewUser: isSignup })
  } catch (err) {
    console.error('Magic link error:', err)
    return NextResponse.json({ error: 'Failed to send sign-in link' }, { status: 500 })
  }
}
