import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

// GET — list all tickets, optional status filter
export async function GET(req: NextRequest) {
  const pool = await getPool()
  try {
    const status = req.nextUrl.searchParams.get('status')

    let query = 'SELECT * FROM tickets'
    const params: unknown[] = []

    if (status) {
      query += ' WHERE status = $1'
      params.push(status)
    }

    query += ' ORDER BY created_at DESC'

    const result = await pool.query(query, params)
    return NextResponse.json({ tickets: result.rows })
  } catch (err) {
    console.error('Tickets GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// POST — create a new ticket
export async function POST(req: NextRequest) {
  const pool = await getPool()
  try {
    const { subject, priority, customer_email, customer_name } = await req.json()

    if (!subject) {
      return NextResponse.json({ error: 'subject is required' }, { status: 400 })
    }

    const result = await pool.query(
      `INSERT INTO tickets (subject, priority, customer_email, customer_name, status)
       VALUES ($1, $2, $3, $4, 'open')
       RETURNING *`,
      [subject, priority || 'medium', customer_email || null, customer_name || null]
    )

    return NextResponse.json({ ticket: result.rows[0] }, { status: 201 })
  } catch (err) {
    console.error('Tickets POST error:', err)
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
