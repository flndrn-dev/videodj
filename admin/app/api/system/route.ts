import { NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

// GET — system health check
export async function GET() {
  const pool = await getPool()
  try {
    const node = {
      version: process.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    }

    let db: { connected: boolean; tables?: Record<string, number> } = { connected: false }

    try {
      await pool.query('SELECT 1')

      const [users, tracks, tickets, devzoneCards] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM users'),
        pool.query('SELECT COUNT(*) FROM tracks'),
        pool.query('SELECT COUNT(*) FROM tickets'),
        pool.query('SELECT COUNT(*) FROM devzone_cards'),
      ])

      db = {
        connected: true,
        tables: {
          users: parseInt(String(users.rows[0].count)),
          tracks: parseInt(String(tracks.rows[0].count)),
          tickets: parseInt(String(tickets.rows[0].count)),
          devzone_cards: parseInt(String(devzoneCards.rows[0].count)),
        },
      }
    } catch (dbErr) {
      console.error('DB health check failed:', dbErr)
      db = { connected: false }
    }

    return NextResponse.json({
      node,
      db,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('System GET error:', err)
    return NextResponse.json({ error: 'Failed to check system health' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
