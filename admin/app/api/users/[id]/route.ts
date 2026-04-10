import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

// GET — get single user with stats
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = await getPool()
  try {
    const { id } = await params

    const [userResult, tracksResult, playlistsResult, conversationsResult, sessionsResult] = await Promise.all([
      pool.query('SELECT * FROM users WHERE id = $1', [id]),
      pool.query('SELECT count(*) as count, sum(times_played) as total_plays FROM tracks WHERE user_id = $1', [id]),
      pool.query('SELECT count(*) as count FROM user_playlists WHERE user_id = $1', [id]),
      pool.query('SELECT count(*) as count, sum(message_count) as total_messages FROM linus_conversations WHERE user_id = $1', [id]),
      pool.query('SELECT count(*) as count FROM auth_sessions WHERE user_id = $1 AND expires_at > NOW()', [id]),
    ])

    if (userResult.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      user: userResult.rows[0],
      stats: {
        tracks: parseInt(tracksResult.rows[0].count) || 0,
        totalPlays: parseInt(tracksResult.rows[0].total_plays) || 0,
        playlists: parseInt(playlistsResult.rows[0].count) || 0,
        conversations: parseInt(conversationsResult.rows[0].count) || 0,
        totalMessages: parseInt(conversationsResult.rows[0].total_messages) || 0,
        activeSessions: parseInt(sessionsResult.rows[0].count) || 0,
      },
    })
  } catch (err) {
    console.error('User GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// PUT — update user
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = await getPool()
  try {
    const { id } = await params
    const { name, email, role, roles, status, password_hash } = await req.json()

    const fields: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (name !== undefined) { fields.push(`name = $${idx}`); values.push(name); idx++ }
    if (email !== undefined) { fields.push(`email = $${idx}`); values.push(email); idx++ }
    if (role !== undefined) { fields.push(`role = $${idx}`); values.push(role); idx++ }
    if (roles !== undefined) { fields.push(`roles = $${idx}`); values.push(roles); idx++ }
    if (status !== undefined) { fields.push(`status = $${idx}`); values.push(status); idx++ }
    if (password_hash !== undefined) { fields.push(`password_hash = $${idx}`); values.push(password_hash); idx++ }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    fields.push('updated_at = NOW()')
    values.push(id)

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user: result.rows[0] })
  } catch (err) {
    console.error('User PUT error:', err)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// DELETE — delete user (prevent deleting admins)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = await getPool()
  try {
    const { id } = await params

    // Check if user is admin
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [id])
    if (userResult.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (userResult.rows[0].role === 'admin') {
      return NextResponse.json({ error: 'Cannot delete admin users' }, { status: 403 })
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id])
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('User DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
