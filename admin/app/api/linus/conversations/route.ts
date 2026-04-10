import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

// GET — list linus conversations with user info
export async function GET(req: NextRequest) {
  const pool = await getPool()
  try {
    const { searchParams } = req.nextUrl
    const limit = parseInt(searchParams.get('limit') || '50')

    const result = await pool.query(
      `SELECT lc.id, lc.user_id, lc.summary, lc.topics, lc.actions,
              lc.message_count, lc.created_at,
              u.name as user_name, u.email
       FROM linus_conversations lc
       LEFT JOIN users u ON lc.user_id = u.id
       ORDER BY lc.created_at DESC
       LIMIT $1`,
      [limit]
    )

    // Read model config from env
    const modelConfig = {
      provider: process.env.AGENT_PROVIDER || 'anthropic',
      model: process.env.AGENT_MODEL || 'claude-sonnet-4-20250514',
      mode: process.env.AGENT_MODE || 'api',
    }

    return NextResponse.json({
      conversations: result.rows,
      modelConfig,
    })
  } catch (err) {
    console.error('Linus conversations GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
