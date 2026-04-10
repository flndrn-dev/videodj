import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 3,
})

async function getUserIdFromSession(req: NextRequest): Promise<string | null> {
  const session = req.cookies.get('videodj_session')
  if (!session?.value) return null

  const result = await pool.query(
    'SELECT user_id FROM auth_sessions WHERE token = $1 AND expires_at > NOW()',
    [session.value]
  )
  return (result.rows[0]?.user_id as string) || null
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromSession(req)
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const result = await pool.query(
      'SELECT id, email, name, role, roles, tier, trial_started_at, created_at, profile_data FROM users WHERE id = $1',
      [userId]
    )
    const user = result.rows[0]
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (err) {
    console.error('Profile GET error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getUserIdFromSession(req)
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { name, profile_data } = await req.json()

    // Validate name
    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }

    // Sanitize profile_data — only allow known fields
    const safeProfile: Record<string, string> = {}
    if (profile_data && typeof profile_data === 'object') {
      const allowed = ['phone', 'dob', 'country', 'city', 'address1', 'address2', 'postalCode', 'avatar']
      for (const key of allowed) {
        if (typeof profile_data[key] === 'string') {
          safeProfile[key] = profile_data[key].trim()
        }
      }
    }

    await pool.query(
      `UPDATE users SET
        name = COALESCE($1, name),
        profile_data = COALESCE($2, profile_data),
        updated_at = NOW()
      WHERE id = $3`,
      [name?.trim() || null, JSON.stringify(safeProfile), userId]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Profile PUT error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
