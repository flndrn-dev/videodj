import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

// GET — list all tracks with pagination and filters
export async function GET(req: NextRequest) {
  const pool = await getPool()
  try {
    const { searchParams } = req.nextUrl
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const userId = searchParams.get('userId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Build WHERE clause with proper parameter indexing
    const conditions: string[] = []
    const filterParams: unknown[] = []
    let idx = 1

    if (userId) {
      conditions.push(`user_id = $${idx}`)
      filterParams.push(userId)
      idx++
    }

    if (status === 'bad') conditions.push('bad_file = true')
    else if (status === 'good') conditions.push('(bad_file = false OR bad_file IS NULL) AND file_name IS NOT NULL')
    else if (status === 'no_file') conditions.push('file_name IS NULL')

    if (search) {
      conditions.push(`(title ILIKE $${idx} OR artist ILIKE $${idx} OR genre ILIKE $${idx})`)
      filterParams.push(`%${search}%`)
      idx++
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Count
    const countResult = await pool.query(`SELECT count(*) FROM tracks ${where}`, filterParams)
    const total = parseInt(String(countResult.rows[0].count))

    // Tracks with pagination
    const paginatedParams = [...filterParams, limit, offset]
    const result = await pool.query(
      `SELECT id, user_id, title, artist, album, genre, bpm, key, duration,
              bad_file, bad_reason, minio_key, file_name, times_played, created_at
       FROM tracks ${where}
       ORDER BY artist ASC, title ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      paginatedParams
    )

    // Aggregate counts (scoped to user if filtered)
    const userWhere = userId ? `WHERE user_id = $1` : ''
    const userParams = userId ? [userId] : []
    const stats = await pool.query(`
      SELECT
        count(*) as total,
        count(*) FILTER (WHERE bad_file = true) as bad,
        count(*) FILTER (WHERE (bad_file = false OR bad_file IS NULL) AND file_name IS NOT NULL) as good,
        count(*) FILTER (WHERE file_name IS NULL) as no_file
      FROM tracks ${userWhere}
    `, userParams)

    // Get distinct users for the filter dropdown
    const usersResult = await pool.query(
      `SELECT DISTINCT t.user_id as id, u.email, u.name
       FROM tracks t LEFT JOIN users u ON t.user_id = u.id
       ORDER BY u.name ASC`
    )

    return NextResponse.json({
      tracks: result.rows,
      total,
      page,
      stats: stats.rows[0],
      users: usersResult.rows,
    })
  } catch (err) {
    console.error('Admin tracks GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// PUT — update track status (authorize/flag)
export async function PUT(req: NextRequest) {
  const pool = await getPool()
  try {
    const { id, bad_file, bad_reason } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await pool.query(
      `UPDATE tracks SET bad_file = $1, bad_reason = $2, updated_at = NOW() WHERE id = $3`,
      [bad_file, bad_reason || null, id]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Admin tracks PUT error:', err)
    return NextResponse.json({ error: 'Failed to update track' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// DELETE — remove track from DB
export async function DELETE(req: NextRequest) {
  const pool = await getPool()
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await pool.query('DELETE FROM tracks WHERE id = $1', [id])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Admin tracks DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete track' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
