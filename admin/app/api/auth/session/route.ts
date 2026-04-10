import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 3,
  })
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('admin_session')?.value
  if (!token) return NextResponse.json({ user: null })

  const pool = await getPool()
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.status FROM users u
       JOIN auth_sessions s ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    )
    await pool.end()
    return NextResponse.json({ user: result.rows[0] || null })
  } catch {
    await pool.end()
    return NextResponse.json({ user: null })
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get('admin_session')?.value
  if (token) {
    const pool = await getPool()
    await pool.query('DELETE FROM auth_sessions WHERE token = $1', [token]).catch(() => {})
    await pool.end()
  }
  const response = NextResponse.json({ success: true })
  response.cookies.delete('admin_session')
  return response
}
