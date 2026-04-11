import { NextRequest, NextResponse } from 'next/server'
import { S3Client, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'https://s3.videodj.studio'
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'videodj_admin'
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'v1de0dj_m1n10_s3cure!'
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'videodj-files'

const s3 = new S3Client({
  endpoint: MINIO_ENDPOINT,
  region: 'us-east-1',
  credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
  forcePathStyle: true,
})

// GET — list all tracks with pagination and filters
export async function GET(req: NextRequest) {
  const pool = await getPool()
  try {
    const { searchParams } = req.nextUrl
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const userId = searchParams.get('userId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Build WHERE clause with proper parameter indexing
    const conditions: string[] = []
    const filterParams: unknown[] = []
    let idx = 1

    if (userId) {
      conditions.push(`user_id = $${idx}`)
      filterParams.push(userId)
      idx++
    }

    if (status === 'bad') conditions.push('bad_file = true')
    else if (status === 'good') conditions.push('(bad_file = false OR bad_file IS NULL) AND minio_key IS NOT NULL')
    else if (status === 'no_file') conditions.push('minio_key IS NULL')

    if (search) {
      conditions.push(`(title ILIKE $${idx} OR artist ILIKE $${idx} OR genre ILIKE $${idx})`)
      filterParams.push(`%${search}%`)
      idx++
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Count
    const countResult = await pool.query(`SELECT count(*) FROM tracks ${where}`, filterParams)
    const total = parseInt(String(countResult.rows[0].count))

    // Tracks with pagination
    const paginatedParams = [...filterParams, limit, offset]
    const result = await pool.query(
      `SELECT id, user_id, title, artist, album, genre, bpm, key, duration,
              bad_file, bad_reason, minio_key, file_name, times_played, created_at
       FROM tracks ${where}
       ORDER BY title ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      paginatedParams
    )

    // Aggregate counts (scoped to user if filtered)
    const userWhere = userId ? `WHERE user_id = $1` : ''
    const userParams = userId ? [userId] : []
    const stats = await pool.query(`
      SELECT
        count(*) as total,
        count(*) FILTER (WHERE bad_file = true) as bad,
        count(*) FILTER (WHERE (bad_file = false OR bad_file IS NULL) AND minio_key IS NOT NULL) as good,
        count(*) FILTER (WHERE minio_key IS NULL) as no_file
      FROM tracks ${userWhere}
    `, userParams)

    // Get distinct users for the filter dropdown
    const usersResult = await pool.query(
      `SELECT DISTINCT t.user_id as id, u.email, u.name
       FROM tracks t LEFT JOIN users u ON t.user_id = u.id
       ORDER BY u.name ASC`
    )

    return NextResponse.json({
      tracks: result.rows,
      total,
      page,
      stats: stats.rows[0],
      users: usersResult.rows,
    })
  } catch (err) {
    console.error('Admin tracks GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// PUT — update track status (authorize/flag)
export async function PUT(req: NextRequest) {
  const pool = await getPool()
  try {
    const { id, bad_file, bad_reason } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await pool.query(
      `UPDATE tracks SET bad_file = $1, bad_reason = $2, updated_at = NOW() WHERE id = $3`,
      [bad_file, bad_reason || null, id]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Admin tracks PUT error:', err)
    return NextResponse.json({ error: 'Failed to update track' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// DELETE — remove track from DB + MinIO
export async function DELETE(req: NextRequest) {
  const pool = await getPool()
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Get MinIO key before deleting
    const track = await pool.query('SELECT minio_key FROM tracks WHERE id = $1', [id])
    const minioKey = track.rows[0]?.minio_key

    // Delete from DB
    await pool.query('DELETE FROM tracks WHERE id = $1', [id])

    // Delete from MinIO if exists
    if (minioKey) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: String(MINIO_BUCKET), Key: String(minioKey) }))
      } catch {
        console.warn(`Failed to delete MinIO object: ${minioKey}`)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Admin tracks DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete track' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// POST — verify if MinIO file exists
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, id, minioKey, key, contentType } = body

    if (action === 'verify' && minioKey) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: String(MINIO_BUCKET), Key: String(minioKey) }))
        return NextResponse.json({ exists: true })
      } catch {
        return NextResponse.json({ exists: false })
      }
    }

    if (action === 'download' && minioKey) {
      const command = new GetObjectCommand({ Bucket: String(MINIO_BUCKET), Key: String(minioKey) })
      const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })
      return NextResponse.json({ downloadUrl })
    }

    if (action === 'test' && minioKey) {
      const command = new GetObjectCommand({ Bucket: String(MINIO_BUCKET), Key: String(minioKey) })
      const streamUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
      return NextResponse.json({ streamUrl })
    }

    if (action === 'upload_url' && key) {
      const command = new PutObjectCommand({ Bucket: String(MINIO_BUCKET), Key: String(key), ContentType: String(contentType || 'video/mp4') })
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })
      return NextResponse.json({ uploadUrl, key })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('Admin tracks POST error:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
