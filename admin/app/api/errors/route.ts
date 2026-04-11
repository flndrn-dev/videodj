import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({ connectionString: process.env.DATABASE_URL!, max: 3 })
}

export async function GET(req: NextRequest) {
  const pool = await getPool()
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100')
    const severity = req.nextUrl.searchParams.get('severity')

    let query = 'SELECT * FROM app_errors'
    const params: unknown[] = []

    if (severity) {
      query += ' WHERE severity = $1'
      params.push(severity)
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1)
    params.push(limit)

    const result = await pool.query(query, params)

    // Also get counts by severity
    const counts = await pool.query(`
      SELECT severity, count(*) as count
      FROM app_errors
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY severity
    `)

    return NextResponse.json({
      errors: result.rows,
      counts: counts.rows,
      total: result.rows.length,
    })
  } catch (err) {
    console.error('Admin errors GET:', err)
    return NextResponse.json({ errors: [], counts: [], total: 0 })
  } finally {
    await pool.end()
  }
}
