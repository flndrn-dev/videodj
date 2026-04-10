import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

// GET — list all users
export async function GET() {
  const pool = await getPool()
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC')
    return NextResponse.json({ users: result.rows })
  } catch (err) {
    console.error('Users GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// POST — create/invite a user
export async function POST(req: NextRequest) {
  const pool = await getPool()
  try {
    const { email, name, role, roles } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    const userRoles = roles || (role ? [role] : ['subscriber'])
    const primaryRole = role || userRoles[0] || 'subscriber'

    const result = await pool.query(
      `INSERT INTO users (email, name, role, roles, status)
       VALUES ($1, $2, $3, $4, 'invited')
       RETURNING *`,
      [email, name || null, primaryRole, userRoles]
    )

    return NextResponse.json({ user: result.rows[0] }, { status: 201 })
  } catch (err) {
    console.error('Users POST error:', err)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
