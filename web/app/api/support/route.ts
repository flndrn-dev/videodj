import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL!, max: 3 })

export async function POST(req: NextRequest) {
  try {
    const { subject, message, category, email, name } = await req.json()
    if (!subject || !message) {
      return NextResponse.json({ error: 'Subject and message required' }, { status: 400 })
    }

    // Get user from session
    const session = req.cookies.get('videodj_session')
    let userId = null
    let userEmail = email || null
    let userName = name || null
    if (session?.value) {
      const result = await pool.query(
        'SELECT u.id, u.email, u.name FROM auth_sessions s JOIN users u ON s.user_id = u.id WHERE s.token = $1 AND s.expires_at > NOW()',
        [session.value]
      )
      if (result.rows[0]) {
        userId = result.rows[0].id
        userEmail = result.rows[0].email
        userName = result.rows[0].name
      }
    }

    // Create ticket
    const ticketResult = await pool.query(
      `INSERT INTO tickets (subject, status, priority, customer_email, customer_name)
       VALUES ($1, 'open', 'medium', $2, $3) RETURNING id`,
      [subject, userEmail || 'unknown', userName || 'App User']
    )

    const attachments = JSON.stringify({
      type: 'in-app',
      category: category || 'General Support',
      source: 'dj-app',
      meta: {
        userId,
        browser: req.headers.get('user-agent'),
        url: req.headers.get('referer'),
      },
    })

    await pool.query(
      'INSERT INTO ticket_messages (ticket_id, sender, text, attachments) VALUES ($1, $2, $3, $4)',
      [ticketResult.rows[0].id, userEmail || 'app-user', message, attachments]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Support widget error:', err)
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 })
  }
}
