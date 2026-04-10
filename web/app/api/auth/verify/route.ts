import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 3,
  })
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.videodj.studio'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(`${BASE_URL}/login?error=missing_token`)
  }

  const pool = await getPool()

  try {
    // Verify magic link
    const linkResult = await pool.query(
      'SELECT * FROM magic_links WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [token]
    )
    const link = linkResult.rows[0]

    if (!link) {
      await pool.end()
      return NextResponse.redirect(`${BASE_URL}/login?error=expired`)
    }

    // Mark as used
    await pool.query('UPDATE magic_links SET used = TRUE WHERE id = $1', [link.id])

    // Get user
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [link.email])
    const user = userResult.rows[0]

    if (!user) {
      await pool.end()
      return NextResponse.redirect(`${BASE_URL}/login?error=no_account`)
    }

    // Activate if invited
    if (user.status === 'invited') {
      await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [user.id])
    }

    // Update activity
    await pool.query('UPDATE users SET last_active = NOW(), sessions_count = sessions_count + 1 WHERE id = $1', [user.id])

    // Create session
    const sessionToken = randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    await pool.query(
      'INSERT INTO auth_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, sessionToken, expiresAt.toISOString()]
    )

    await pool.end()

    // Set session cookie and redirect to app
    const response = NextResponse.redirect(`${BASE_URL}/`)
    response.cookies.set('videodj_session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (err) {
    console.error('Verify error:', err)
    await pool.end()
    return NextResponse.redirect(`${BASE_URL}/login?error=server_error`)
  }
}
