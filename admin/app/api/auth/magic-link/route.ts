import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'
import { Resend } from 'resend'
import { randomBytes } from 'crypto'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 5,
})

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://admin.videodj.studio'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    // Check if user exists and is allowed
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    const user = userResult.rows[0]

    if (!user) {
      return NextResponse.json({ error: 'No account found. Contact admin for access.' }, { status: 403 })
    }
    if (user.status === 'disabled') {
      return NextResponse.json({ error: 'Account disabled. Contact admin.' }, { status: 403 })
    }
    if (!['admin', 'support_agent'].includes(user.role as string)) {
      return NextResponse.json({ error: 'Dashboard access not available for your role.' }, { status: 403 })
    }

    // Create magic link
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    await pool.query(
      'INSERT INTO magic_links (email, token, expires_at) VALUES ($1, $2, $3)',
      [email, token, expiresAt.toISOString()]
    )

    const magicUrl = `${BASE_URL}/api/auth/verify?token=${token}`

    // Send email
    if (resend) {
      await resend.emails.send({
        from: 'videoDJ.Studio <noreply@videodj.studio>',
        to: email,
        subject: 'Sign in to videoDJ.Studio Admin',
        html: `
          <div style="background:#0a0a14;color:#f0f0f8;padding:40px;font-family:system-ui,sans-serif;">
            <h1 style="color:#ffff00;font-size:24px;margin-bottom:16px;">Sign in to Admin Dashboard</h1>
            <p style="color:#9898b8;font-size:16px;line-height:1.6;margin-bottom:24px;">
              Click the button below to sign in. This link expires in 15 minutes.
            </p>
            <a href="${magicUrl}" style="display:inline-block;background:#ffff00;color:#0a0a14;padding:14px 32px;border-radius:12px;font-weight:600;text-decoration:none;font-size:14px;">
              Sign In
            </a>
            <p style="color:#5a5a78;font-size:12px;margin-top:24px;">
              If you didn't request this, ignore this email.
            </p>
          </div>
        `,
      })
    }

    return NextResponse.json({ success: true, message: 'Magic link sent to your email' })
  } catch (err) {
    console.error('Magic link error:', err)
    return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
  }
}
