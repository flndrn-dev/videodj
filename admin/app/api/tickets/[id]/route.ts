import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

// GET — single ticket with messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = await getPool()
  try {
    const { id } = await params

    const ticketResult = await pool.query('SELECT * FROM tickets WHERE id = $1', [id])
    if (ticketResult.rowCount === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const messagesResult = await pool.query(
      'SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC',
      [id]
    )

    return NextResponse.json({
      ticket: ticketResult.rows[0],
      messages: messagesResult.rows,
    })
  } catch (err) {
    console.error('Ticket GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch ticket' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// PUT — update ticket status/assignment
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = await getPool()
  try {
    const { id } = await params
    const { status, assigned_to } = await req.json()

    const fields: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (status !== undefined) { fields.push(`status = $${idx}`); values.push(status); idx++ }
    if (assigned_to !== undefined) { fields.push(`assigned_to = $${idx}`); values.push(assigned_to); idx++ }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    fields.push('updated_at = NOW()')
    values.push(id)

    const result = await pool.query(
      `UPDATE tickets SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    return NextResponse.json({ ticket: result.rows[0] })
  } catch (err) {
    console.error('Ticket PUT error:', err)
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// POST — add message to ticket
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = await getPool()
  try {
    const { id } = await params
    const { sender, text } = await req.json()

    if (!sender || !text) {
      return NextResponse.json({ error: 'sender and text are required' }, { status: 400 })
    }

    const messageResult = await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender, text)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, sender, text]
    )

    // Update ticket's updated_at
    await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [id])

    return NextResponse.json({ message: messageResult.rows[0] }, { status: 201 })
  } catch (err) {
    console.error('Ticket message POST error:', err)
    return NextResponse.json({ error: 'Failed to add message' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
