import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { Resend } from 'resend'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://ghost:gh0st_s3cure_p4ss@localhost:5432/videodj_studio',
    max: 3,
  })
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://videodj.studio'
const APP_URL = process.env.APP_URL || 'https://app.videodj.studio'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const pool = await getPool()

    // Check if user exists and is allowed
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    const user = userResult.rows[0]

    if (!user) {
      await pool.end()
      // Not registered — denied, guide to subscribe
      return NextResponse.json({ error: 'not_registered' }, { status: 403 })
    }

    if (user.status === 'disabled') {
      await pool.end()
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 })
    }

    // Create magic link
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    await pool.query(
      'INSERT INTO magic_links (email, token, expires_at) VALUES ($1, $2, $3)',
      [email, token, expiresAt.toISOString()]
    )
    await pool.end()

    const verifyUrl = `${BASE_URL}/api/auth/verify/web?token=${token}`

    // Send email
    if (resend) {
      await resend.emails.send({
        from: 'videoDJ.Studio <noreply@videodj.studio>',
        to: email,
        subject: 'Sign in to videoDJ.Studio',
        html: `
          <div style="background:#0a0a14;color:#f0f0f8;padding:48px 32px;font-family:system-ui,-apple-system,sans-serif;max-width:500px;margin:0 auto;border-radius:24px;">
            <div style="text-align:center;margin-bottom:40px;">
              <div style="display:inline-block;background:rgba(255,255,0,0.1);border:1px solid rgba(255,255,0,0.15);border-radius:20px;padding:16px 20px;">
                <span style="color:#ffff00;font-size:28px;font-weight:bold;">V</span>
              </div>
            </div>
            <h1 style="color:#ffff00;font-size:22px;font-weight:600;text-align:center;margin-bottom:12px;">Sign in to videoDJ.Studio</h1>
            <p style="color:#9898b8;font-size:15px;text-align:center;line-height:1.7;margin-bottom:36px;">
              Click the button below to sign in and start mixing.
            </p>
            <div style="text-align:center;margin-bottom:36px;">
              <a href="${verifyUrl}" style="display:inline-block;background:#ffff00;color:#0a0a14;padding:16px 48px;border-radius:16px;font-weight:700;text-decoration:none;font-size:15px;box-shadow:0 0 30px rgba(255,255,0,0.15);">
                Sign In to videoDJ.Studio
              </a>
            </div>
            <p style="color:#5a5a78;font-size:12px;text-align:center;line-height:1.6;">
              This link expires in 15 minutes.<br/>
              If you didn't request this, you can safely ignore it.
            </p>
          </div>
        `,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Magic link error:', err)
    return NextResponse.json({ error: 'Failed to send sign-in link' }, { status: 500 })
  }
}
