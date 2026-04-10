import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.videodj.studio'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

async function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  const { Resend } = await import('resend')
  return new Resend(key)
}

// GET — list all users
export async function GET() {
  const pool = await getPool()
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC')
    return NextResponse.json({ users: result.rows })
  } catch (err) {
    console.error('Users GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// POST — create/invite a user + send invite email via Resend
export async function POST(req: NextRequest) {
  const pool = await getPool()
  try {
    const { email, name, role, roles } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    const userRoles = roles || (role ? [role] : ['subscriber'])
    const primaryRole = role || userRoles[0] || 'subscriber'

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, name, role, roles, status)
       VALUES ($1, $2, $3, $4, 'invited')
       RETURNING *`,
      [email, name || null, primaryRole, userRoles]
    )

    const user = result.rows[0]

    // Create magic link token for the invite
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days for invites

    await pool.query(
      'INSERT INTO magic_links (email, token, expires_at) VALUES ($1, $2, $3)',
      [email, token, expiresAt.toISOString()]
    )

    const inviteUrl = `${APP_URL}/api/auth/verify?token=${token}`
    const displayName = name || email.split('@')[0]
    const roleLabel = userRoles.map((r: string) => r.replace(/_/g, ' ')).join(', ')

    // Send invite email via Resend
    const resend = await getResend()
    let emailSent = false
    if (resend) {
      try {
        await resend.emails.send({
          from: 'videoDJ.Studio <noreply@videodj.studio>',
          to: email,
          subject: `You're invited to videoDJ.Studio`,
          html: `
            <div style="background:#14141f;color:#e8e8f2;padding:48px 32px;font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;">
              <div style="text-align:center;margin-bottom:32px;">
                <div style="display:inline-block;background:rgba(255,255,0,0.12);border:1px solid rgba(255,255,0,0.2);border-radius:16px;padding:12px 16px;">
                  <span style="color:#ffff00;font-size:24px;font-weight:bold;">V</span>
                </div>
              </div>
              <h1 style="color:#ffff00;font-size:20px;font-weight:600;text-align:center;margin-bottom:8px;">
                Welcome to videoDJ.Studio
              </h1>
              <p style="color:#9898b8;font-size:14px;text-align:center;line-height:1.6;margin-bottom:8px;">
                Hi ${displayName}, you've been invited as <strong style="color:#e8e8f2;">${roleLabel}</strong>.
              </p>
              <p style="color:#9898b8;font-size:14px;text-align:center;line-height:1.6;margin-bottom:32px;">
                Click below to activate your account. This link expires in 7 days.
              </p>
              <div style="text-align:center;margin-bottom:32px;">
                <a href="${inviteUrl}" style="display:inline-block;background:#ffff00;color:#14141f;padding:14px 40px;border-radius:12px;font-weight:600;text-decoration:none;font-size:14px;">
                  Activate Account
                </a>
              </div>
              <p style="color:#5a5a78;font-size:11px;text-align:center;">
                If you didn't expect this invite, you can safely ignore this email.
              </p>
            </div>
          `,
        })
        emailSent = true
      } catch (err) {
        console.error('Failed to send invite email:', err)
      }
    }

    return NextResponse.json({ user, emailSent }, { status: 201 })
  } catch (err) {
    console.error('Users POST error:', err)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
