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
      `SELECT s.user_id, u.email, u.name, u.role, u.roles, u.tier, u.trial_started_at, u.created_at, u.profile_data
       FROM auth_sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [session.value]
    )
    const row = result.rows[0]
    if (!row) return NextResponse.json({ userId: null })
    return NextResponse.json({
      userId: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      roles: row.roles || [],
      tier: row.tier || 'free',
      trialStartedAt: row.trial_started_at,
      createdAt: row.created_at,
      profileData: row.profile_data || {},
    })
  } catch (err) {
    console.error('Session lookup error:', err)
    return NextResponse.json({ userId: null }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = req.cookies.get('videodj_session')
  if (session?.value) {
    try {
      await pool.query('DELETE FROM auth_sessions WHERE token = $1', [session.value])
    } catch (err) {
      console.error('Session delete error:', err)
    }
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('videodj_session', '', { maxAge: 0, path: '/' })
  return res
}
