import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 3,
})

export async function GET(req: NextRequest) {
  const session = req.cookies.get('videodj_session')
  if (!session?.value) {
    return NextResponse.json({ userId: null })
  }

  try {
    const result = await pool.query(
      `SELECT s.user_id, u.email, u.name, u.role
       FROM auth_sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [session.value]
    )
    const row = result.rows[0] as { user_id: string; email: string; name: string; role: string } | undefined
    if (!row) return NextResponse.json({ userId: null })
    return NextResponse.json({ userId: row.user_id, email: row.email, name: row.name, role: row.role })
  } catch (err) {
    console.error('Session lookup error:', err)
    return NextResponse.json({ userId: null }, { status: 500 })
  }
}
