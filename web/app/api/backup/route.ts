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
    const tracksResult = await pool.query(
      'SELECT * FROM tracks WHERE user_id = $1 ORDER BY title ASC',
      [userId]
    )
    const playlistsResult = await pool.query(
      'SELECT * FROM user_playlists WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    )

    return NextResponse.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      tracks: tracksResult.rows,
      playlists: playlistsResult.rows,
    })
  } catch (err) {
    console.error('Backup GET error:', err)
    return NextResponse.json({ error: 'Failed to export backup' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(getClientIp(req), RATE_LIMITS.crud)
  if (limited) return limited

  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { tracks, playlists } = await req.json()

    let tracksImported = 0
    let tracksUpdated = 0
    let playlistsImported = 0

    // Upsert tracks by (user_id, file_name)
    if (Array.isArray(tracks)) {
      for (const t of tracks) {
        const existing = await pool.query(
          'SELECT id FROM tracks WHERE user_id = $1 AND file_name = $2',
          [userId, t.file_name]
        )

        if (existing.rows.length > 0) {
          // Update existing track metadata
          await pool.query(
            `UPDATE tracks SET title = $1, artist = $2, album = $3, remixer = $4, genre = $5,
             language = $6, bpm = $7, key = $8, released = $9, duration = $10,
             loudness = $11, effective_end_time = $12, updated_at = NOW()
             WHERE user_id = $13 AND file_name = $14`,
            [
              t.title, t.artist || '', t.album || '', t.remixer || '', t.genre || '',
              t.language || null, t.bpm || 0, t.key || '', t.released || '', t.duration || 0,
              t.loudness || null, t.effective_end_time || null,
              userId, t.file_name,
            ]
          )
          tracksUpdated++
        } else {
          // Insert new track
          await pool.query(
            `INSERT INTO tracks (id, user_id, title, artist, album, remixer, genre, language,
             bpm, key, released, duration, file_name, file_size, minio_key, thumbnail_url,
             file_url, loudness, waveform_peaks, effective_end_time)
             VALUES (COALESCE($1, gen_random_uuid()), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
            [
              t.id || null, userId, t.title, t.artist || '', t.album || '', t.remixer || '',
              t.genre || '', t.language || null, t.bpm || 0, t.key || '', t.released || '',
              t.duration || 0, t.file_name || null, t.file_size || 0, t.minio_key || null,
              t.thumbnail_url || null, t.file_url || null, t.loudness || null,
              t.waveform_peaks ? JSON.stringify(t.waveform_peaks) : null,
              t.effective_end_time || null,
            ]
          )
          tracksImported++
        }
      }
    }

    // Upsert playlists by (user_id, name)
    if (Array.isArray(playlists)) {
      for (const p of playlists) {
        const existing = await pool.query(
          'SELECT id FROM user_playlists WHERE user_id = $1 AND name = $2',
          [userId, p.name]
        )

        if (existing.rows.length > 0) {
          await pool.query(
            `UPDATE user_playlists SET track_ids = $1, total_duration = $2, updated_at = NOW()
             WHERE user_id = $3 AND name = $4`,
            [p.track_ids || [], p.total_duration || 0, userId, p.name]
          )
        } else {
          await pool.query(
            `INSERT INTO user_playlists (id, user_id, name, created_by, track_ids, total_duration)
             VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6)`,
            [p.id || null, userId, p.name, p.created_by || 'backup', p.track_ids || [], p.total_duration || 0]
          )
        }
        playlistsImported++
      }
    }

    return NextResponse.json({ tracksImported, tracksUpdated, playlistsImported })
  } catch (err) {
    console.error('Backup POST error:', err)
    return NextResponse.json({ error: 'Failed to restore backup' }, { status: 500 })
  }
}
