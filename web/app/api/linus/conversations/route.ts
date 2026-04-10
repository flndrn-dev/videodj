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

export async function POST(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { summary, topics, actions, messageCount } = await req.json()
    if (!summary) return NextResponse.json({ error: 'summary required' }, { status: 400 })

    const result = await pool.query(
      `INSERT INTO linus_conversations (user_id, summary, topics, actions, message_count)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, summary, topics || [], actions || [], messageCount || 0]
    )

    return NextResponse.json({ conversation: result.rows[0] })
  } catch (err) {
    console.error('Linus conversations POST error:', err)
    return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')

  try {
    const result = await pool.query(
      'SELECT * FROM linus_conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    )
    return NextResponse.json({ conversations: result.rows })
  } catch (err) {
    console.error('Linus conversations GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}
