import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 3,
})

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  try {
    // Look up playlist by share_code — never expose user_id
    const playlistResult = await pool.query(
      'SELECT id, name, track_ids, total_duration, created_at FROM user_playlists WHERE share_code = $1',
      [code]
    )

    if (playlistResult.rows.length === 0) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })
    }

    const playlist = playlistResult.rows[0] as {
      id: string
      name: string
      track_ids: string[]
      total_duration: number
      created_at: string
    }

    // Fetch track metadata for each track_id — never expose file URLs or user_id
    let tracks: Record<string, unknown>[] = []
    if (playlist.track_ids && playlist.track_ids.length > 0) {
      const tracksResult = await pool.query(
        'SELECT id, title, artist, album, genre, bpm, key, duration FROM tracks WHERE id = ANY($1)',
        [playlist.track_ids]
      )
      // Preserve playlist order
      const trackMap = new Map(tracksResult.rows.map((t: Record<string, unknown>) => [t.id, t]))
      tracks = playlist.track_ids
        .map((id: string) => trackMap.get(id))
        .filter(Boolean) as Record<string, unknown>[]
    }

    return NextResponse.json({
      playlist: {
        name: playlist.name,
        trackCount: tracks.length,
        totalDuration: playlist.total_duration,
        createdAt: playlist.created_at,
      },
      tracks,
    })
  } catch (err) {
    console.error('Shared playlist GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch shared playlist' }, { status: 500 })
  }
}
