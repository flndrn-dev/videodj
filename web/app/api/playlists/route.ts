import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'
import { getClientIp, rateLimitResponse, RATE_LIMITS } from '@/app/lib/rateLimit'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 3,
})

async function getUserId(req: NextRequest): Promise<string | null> {
  const session = req.cookies.get('videodj_session')
  if (!session?.value) return null
  const result = await pool.query(
    'SELECT user_id FROM auth_sessions WHERE token = $1 AND expires_at > NOW()',
    [session.value]
  )
  return (result.rows[0] as { user_id: string } | undefined)?.user_id ?? null
}

export async function GET(req: NextRequest) {
  const limited = rateLimitResponse(getClientIp(req), RATE_LIMITS.crud)
  if (limited) return limited

  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await pool.query(
      'SELECT * FROM user_playlists WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    )
    return NextResponse.json({ playlists: result.rows })
  } catch (err) {
    console.error('Playlists GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch playlists' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(getClientIp(req), RATE_LIMITS.crud)
  if (limited) return limited

  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id, name, createdBy, trackIds, totalDuration } = await req.json()
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    // Upsert — create or update
    const result = await pool.query(
      `INSERT INTO user_playlists (id, user_id, name, created_by, track_ids, total_duration)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET name = $3, track_ids = $5, total_duration = $6, updated_at = NOW()
       RETURNING *`,
      [id || null, userId, name, createdBy || 'user', trackIds || [], totalDuration || 0]
    )

    return NextResponse.json({ playlist: result.rows[0] })
  } catch (err) {
    console.error('Playlists POST error:', err)
    return NextResponse.json({ error: 'Failed to save playlist' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const limited = rateLimitResponse(getClientIp(req), RATE_LIMITS.crud)
  if (limited) return limited

  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    await pool.query('DELETE FROM user_playlists WHERE id = $1 AND user_id = $2', [id, userId])
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Playlists DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete playlist' }, { status: 500 })
  }
}
