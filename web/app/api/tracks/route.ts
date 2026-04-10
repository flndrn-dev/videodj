/**
 * Tracks API — CRUD for track metadata in PostgreSQL
 *
 * GET /api/tracks?userId=xxx — list all tracks for a user
 * POST /api/tracks — create a new track (after file upload to MinIO)
 * PUT /api/tracks — update track metadata
 * DELETE /api/tracks?id=xxx — delete track (+ MinIO file)
 */

import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 5,
})

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  const search = req.nextUrl.searchParams.get('search')

  try {
    let result
    if (search) {
      result = await pool.query(
        `SELECT * FROM tracks WHERE user_id = $1 AND (
          title ILIKE $2 OR artist ILIKE $2 OR album ILIKE $2 OR genre ILIKE $2
        ) ORDER BY title ASC`,
        [userId, `%${search}%`]
      )
    } else if (userId) {
      result = await pool.query('SELECT * FROM tracks WHERE user_id = $1 ORDER BY title ASC', [userId])
    } else {
      // No userId — return empty (auth will be enforced later)
      return NextResponse.json({ tracks: [] })
    }

    return NextResponse.json({ tracks: result.rows })
  } catch (err) {
    console.error('Tracks GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const {
      id, user_id, title, artist, album, remixer, genre, language,
      bpm, key, released, duration, file_name, file_size,
      minio_key, thumbnail_url, file_url, loudness, waveform_peaks,
      effective_end_time,
    } = data

    if (!user_id || !title) {
      return NextResponse.json({ error: 'user_id and title required' }, { status: 400 })
    }

    // Validate UUID format if provided — reject legacy timestamp IDs
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const trackId = id && UUID_REGEX.test(id) ? id : null

    // Duplicate detection by filename
    if (file_name) {
      const dup = await pool.query(
        'SELECT id FROM tracks WHERE user_id = $1 AND file_name = $2',
        [user_id, file_name]
      )
      if (dup.rows.length > 0) {
        return NextResponse.json({ error: 'Track already exists', existingId: dup.rows[0].id }, { status: 409 })
      }
    }

    const result = await pool.query(
      `INSERT INTO tracks (id, user_id, title, artist, album, remixer, genre, language, bpm, key, released, duration, file_name, file_size, minio_key, thumbnail_url, file_url, loudness, waveform_peaks, effective_end_time)
       VALUES (COALESCE($1, gen_random_uuid()), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [trackId, user_id, title, artist || '', album || '', remixer || '', genre || '', language || null,
       bpm || 0, key || '', released || '', duration || 0, file_name || null, file_size || 0,
       minio_key || null, thumbnail_url || null, file_url || null, loudness || null,
       waveform_peaks ? JSON.stringify(waveform_peaks) : null, effective_end_time || null]
    )

    return NextResponse.json({ track: result.rows[0] })
  } catch (err) {
    console.error('Tracks POST error:', err)
    return NextResponse.json({ error: 'Failed to create track' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const fields: string[] = []
    const values: unknown[] = []
    let idx = 1

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && key !== 'id' && key !== 'user_id' && key !== 'created_at') {
        fields.push(`"${key}" = $${idx}`)
        values.push(key === 'waveform_peaks' ? JSON.stringify(value) : value)
        idx++
      }
    }

    if (fields.length === 0) return NextResponse.json({ error: 'No updates provided' }, { status: 400 })

    fields.push('updated_at = NOW()')
    values.push(id)

    await pool.query(`UPDATE tracks SET ${fields.join(', ')} WHERE id = $${idx}`, values)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Tracks PUT error:', err)
    return NextResponse.json({ error: 'Failed to update track' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    // Get minio_key before deleting (for file cleanup)
    const track = await pool.query('SELECT minio_key FROM tracks WHERE id = $1', [id])
    await pool.query('DELETE FROM tracks WHERE id = $1', [id])

    return NextResponse.json({ success: true, minioKey: track.rows[0]?.minio_key })
  } catch (err) {
    console.error('Tracks DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete track' }, { status: 500 })
  }
}
