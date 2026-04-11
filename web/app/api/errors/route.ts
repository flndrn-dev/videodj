import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({ connectionString: process.env.DATABASE_URL!, max: 3 })
}

// Ensure table exists on first call
let tableReady = false
async function ensureTable(pool: any) {
  if (tableReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_errors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      error_message TEXT NOT NULL,
      stack_trace TEXT,
      component TEXT,
      severity TEXT DEFAULT 'error',
      user_id UUID,
      user_email TEXT,
      browser TEXT,
      url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  tableReady = true
}

export async function POST(req: NextRequest) {
  const pool = await getPool()
  try {
    const { message, stack, component, severity, userId, userEmail, browser, url } = await req.json()
    if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

    await ensureTable(pool)
    await pool.query(
      `INSERT INTO app_errors (error_message, stack_trace, component, severity, user_id, user_email, browser, url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [message, stack || null, component || 'unknown', severity || 'error', userId || null, userEmail || null, browser || null, url || null]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error reporting failed:', err)
    return NextResponse.json({ error: 'Failed to store error' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// GET — list recent errors (for admin dashboard)
export async function GET(req: NextRequest) {
  const pool = await getPool()
  try {
    await ensureTable(pool)
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
    const result = await pool.query(
      'SELECT * FROM app_errors ORDER BY created_at DESC LIMIT $1',
      [limit]
    )
    return NextResponse.json({ errors: result.rows })
  } catch (err) {
    console.error('Error list failed:', err)
    return NextResponse.json({ errors: [] })
  } finally {
    await pool.end()
  }
}
