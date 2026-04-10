import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 3,
  })
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const pool = await getPool()
    const passHash = createHash('sha256').update(password).digest('hex')

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND password_hash = $2',
      [email, passHash]
    )
    const user = result.rows[0]

    if (!user) {
      await pool.end()
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (user.status === 'disabled') {
      await pool.end()
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 })
    }

    if (!['admin', 'support_agent'].includes(user.role as string)) {
      await pool.end()
      return NextResponse.json({ error: 'Dashboard access not available for your role' }, { status: 403 })
    }

    // Create session
    const token = randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await pool.query(
      'INSERT INTO auth_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt.toISOString()]
    )

    // Update last active
    await pool.query('UPDATE users SET last_active = NOW(), sessions_count = sessions_count + 1 WHERE id = $1', [user.id])
    await pool.end()

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })

    response.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
