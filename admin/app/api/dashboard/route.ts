import { NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

// GET — dashboard aggregate metrics
export async function GET() {
  const pool = await getPool()
  try {
    const [
      usersCount,
      tracksCount,
      sessionsCount,
      conversationsCount,
      recentTracks,
      recentUsers,
      recentConversations,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM tracks'),
      pool.query('SELECT COUNT(*) FROM auth_sessions WHERE expires_at > NOW()'),
      pool.query('SELECT COUNT(*) FROM linus_conversations'),
      pool.query(
        `SELECT id, title, artist, created_at FROM tracks
         ORDER BY created_at DESC LIMIT 10`
      ),
      pool.query(
        `SELECT id, name, email, last_active FROM users
         ORDER BY last_active DESC NULLS LAST LIMIT 5`
      ),
      pool.query(
        `SELECT id, summary, message_count, created_at FROM linus_conversations
         ORDER BY created_at DESC LIMIT 5`
      ),
    ])

    return NextResponse.json({
      totalUsers: parseInt(String(usersCount.rows[0].count)),
      totalTracks: parseInt(String(tracksCount.rows[0].count)),
      activeSessions: parseInt(String(sessionsCount.rows[0].count)),
      totalConversations: parseInt(String(conversationsCount.rows[0].count)),
      recentTracks: recentTracks.rows,
      recentUsers: recentUsers.rows,
      recentConversations: recentConversations.rows,
    })
  } catch (err) {
    console.error('Dashboard GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch dashboard metrics' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
