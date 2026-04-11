import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'

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

// POST — save or update a conversation (upsert by session_id)
export async function POST(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { sessionId, messages, summary, provider, model } = await req.json()
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

    // Upsert — update if session exists, insert if not
    const existing = await pool.query(
      'SELECT id FROM linus_conversations WHERE session_id = $1 AND user_id = $2',
      [sessionId, userId]
    )

    if (existing.rows.length > 0) {
      // Update existing conversation
      await pool.query(
        `UPDATE linus_conversations SET messages = $1, summary = $2, provider = $3, model = $4, updated_at = NOW()
         WHERE session_id = $5 AND user_id = $6`,
        [JSON.stringify(messages || []), summary || null, provider || null, model || null, sessionId, userId]
      )
    } else {
      // Insert new conversation
      await pool.query(
        `INSERT INTO linus_conversations (user_id, session_id, messages, summary, provider, model)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, sessionId, JSON.stringify(messages || []), summary || null, provider || null, model || null]
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Linus conversations POST error:', err)
    return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 })
  }
}

// GET — list conversations for the current user
export async function GET(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')

  try {
    const result = await pool.query(
      'SELECT * FROM linus_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2',
      [userId, limit]
    )
    return NextResponse.json({ conversations: result.rows })
  } catch (err) {
    console.error('Linus conversations GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}
