import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

const VALID_COLUMNS = ['ideas', 'todo', 'in_progress', 'testing', 'done']
const VALID_PRIORITIES = ['low', 'medium', 'high']

// GET — list all devzone cards
export async function GET() {
  const pool = await getPool()
  try {
    const result = await pool.query(
      `SELECT * FROM devzone_cards ORDER BY sort_order ASC, created_at DESC`
    )
    return NextResponse.json({ cards: result.rows })
  } catch (err) {
    console.error('DevZone GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch cards' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// POST — create a new card
export async function POST(req: NextRequest) {
  const pool = await getPool()
  try {
    const { title, description, column, priority, tags, created_by } = await req.json()

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const col = column && VALID_COLUMNS.includes(column) ? column : 'ideas'
    const prio = priority && VALID_PRIORITIES.includes(priority) ? priority : 'medium'

    const result = await pool.query(
      `INSERT INTO devzone_cards (title, description, "column", priority, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, description || null, col, prio, tags || null, created_by || null]
    )

    return NextResponse.json({ card: result.rows[0] }, { status: 201 })
  } catch (err) {
    console.error('DevZone POST error:', err)
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// PUT — update a card
export async function PUT(req: NextRequest) {
  const pool = await getPool()
  try {
    const { id, title, description, column, priority, tags, sort_order } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (column && !VALID_COLUMNS.includes(column)) {
      return NextResponse.json({ error: 'Invalid column value' }, { status: 400 })
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority value' }, { status: 400 })
    }

    const fields: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (title !== undefined) { fields.push(`title = $${idx}`); params.push(title); idx++ }
    if (description !== undefined) { fields.push(`description = $${idx}`); params.push(description); idx++ }
    if (column !== undefined) { fields.push(`"column" = $${idx}`); params.push(column); idx++ }
    if (priority !== undefined) { fields.push(`priority = $${idx}`); params.push(priority); idx++ }
    if (tags !== undefined) { fields.push(`tags = $${idx}`); params.push(tags); idx++ }
    if (sort_order !== undefined) { fields.push(`sort_order = $${idx}`); params.push(sort_order); idx++ }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    fields.push('updated_at = NOW()')
    params.push(id)

    const result = await pool.query(
      `UPDATE devzone_cards SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    return NextResponse.json({ card: result.rows[0] })
  } catch (err) {
    console.error('DevZone PUT error:', err)
    return NextResponse.json({ error: 'Failed to update card' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// DELETE — delete a card by id
export async function DELETE(req: NextRequest) {
  const pool = await getPool()
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
    }

    const result = await pool.query('DELETE FROM devzone_cards WHERE id = $1', [id])

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DevZone DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete card' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
