import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'
import { randomUUID } from 'crypto'

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    // Check playlist belongs to user
    const playlist = await pool.query(
      'SELECT id, share_code FROM user_playlists WHERE id = $1 AND user_id = $2',
      [id, userId]
    )

    if (playlist.rows.length === 0) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })
    }

    // Return existing share_code if already set
    const existing = playlist.rows[0] as { id: string; share_code: string | null }
    if (existing.share_code) {
      return NextResponse.json({ shareCode: existing.share_code })
    }

    // Generate and store new share_code
    const shareCode = randomUUID()
    await pool.query(
      'UPDATE user_playlists SET share_code = $1 WHERE id = $2 AND user_id = $3',
      [shareCode, id, userId]
    )

    return NextResponse.json({ shareCode })
  } catch (err) {
    console.error('Share POST error:', err)
    return NextResponse.json({ error: 'Failed to share playlist' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const result = await pool.query(
      'UPDATE user_playlists SET share_code = NULL WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Share DELETE error:', err)
    return NextResponse.json({ error: 'Failed to unshare playlist' }, { status: 500 })
  }
}
