import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'
import { getClientIp, rateLimitResponse, RATE_LIMITS } from '@/app/lib/rateLimit'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 3,
})

export async function GET(req: NextRequest) {
  const limited = rateLimitResponse(getClientIp(req), RATE_LIMITS.public)
  if (limited) return limited

  try {
    const q = req.nextUrl.searchParams.get('q')
    const genre = req.nextUrl.searchParams.get('genre')
    const bpmMin = req.nextUrl.searchParams.get('bpm_min')
    const bpmMax = req.nextUrl.searchParams.get('bpm_max')

    const conditions: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (q) {
      conditions.push(`(title ILIKE $${idx} OR artist ILIKE $${idx} OR album ILIKE $${idx})`)
      values.push(`%${q}%`)
      idx++
    }

    if (genre) {
      conditions.push(`genre ILIKE $${idx}`)
      values.push(`%${genre}%`)
      idx++
    }

    if (bpmMin) {
      conditions.push(`bpm >= $${idx}`)
      values.push(Number(bpmMin))
      idx++
    }

    if (bpmMax) {
      conditions.push(`bpm <= $${idx}`)
      values.push(Number(bpmMax))
      idx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Count total matches
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT (title, artist)) as total FROM tracks ${whereClause}`,
      values
    )

    // Fetch distinct tracks — never expose user_id, file_url, minio_key
    const result = await pool.query(
      `SELECT DISTINCT ON (title, artist)
        title, artist, album, genre, bpm, key, duration
       FROM tracks ${whereClause}
       ORDER BY title, artist
       LIMIT 50`,
      values
    )

    return NextResponse.json({
      tracks: result.rows,
      total: Number(countResult.rows[0]?.total ?? 0),
    })
  } catch (err) {
    console.error('Catalog GET error:', err)
    return NextResponse.json({ error: 'Failed to search catalog' }, { status: 500 })
  }
}
