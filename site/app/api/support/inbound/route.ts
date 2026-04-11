import { NextRequest, NextResponse } from 'next/server'

/**
 * Resend Inbound Webhook — receives email replies to support@videodj.studio
 * and adds them to the corresponding support ticket conversation.
 *
 * Setup in Resend dashboard:
 * 1. Go to Domains → videodj.studio → Inbound
 * 2. Add webhook URL: https://videodj.studio/api/support/inbound
 * 3. MX record: inbound-smtp.resend.com (priority 10) for support.videodj.studio or videodj.studio
 */

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({ connectionString: process.env.DATABASE_URL!, max: 3 })
}

export async function POST(req: NextRequest) {
  const pool = await getPool()
  try {
    const body = await req.json()

    // Resend inbound webhook payload
    const from = body.from || body.envelope?.from || ''
    const subject = body.subject || ''
    const textBody = body.text || body.html?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || ''
    const senderEmail = typeof from === 'string' ? from : (from?.address || from?.email || String(from))

    if (!senderEmail || !textBody) {
      return NextResponse.json({ error: 'Missing sender or body' }, { status: 400 })
    }

    // Extract ticket number from subject — looks for [SUP-20260412-001] or SUP-20260412-001
    const ticketMatch = subject.match(/\[?(SUP|FIN|REC)-(\d{8})-(\d{3})\]?/)
    const ticketNumber = ticketMatch ? ticketMatch[0].replace(/[\[\]]/g, '') : null

    let ticketId: string | null = null

    if (ticketNumber) {
      // Find the ticket by ticket number stored in first message attachments
      const ticketResult = await pool.query(
        `SELECT t.id FROM tickets t
         JOIN ticket_messages tm ON tm.ticket_id = t.id
         WHERE tm.attachments::text LIKE $1
         LIMIT 1`,
        [`%${ticketNumber}%`]
      )
      ticketId = (ticketResult.rows[0]?.id as string) || null
    }

    if (!ticketId) {
      // No ticket number found — try to find by customer email
      const emailMatch = senderEmail.match(/[^<\s]+@[^>\s]+/)
      const cleanEmail = emailMatch ? emailMatch[0].toLowerCase() : senderEmail.toLowerCase()

      const ticketResult = await pool.query(
        `SELECT id FROM tickets
         WHERE customer_email = $1 AND status != 'closed'
         ORDER BY updated_at DESC LIMIT 1`,
        [cleanEmail]
      )
      ticketId = (ticketResult.rows[0]?.id as string) || null

      if (!ticketId) {
        // No matching ticket — create a new one from the email
        const newTicket = await pool.query(
          `INSERT INTO tickets (subject, status, priority, customer_email, customer_name)
           VALUES ($1, 'open', 'medium', $2, $3)
           RETURNING id`,
          [subject || 'Email inquiry', cleanEmail, cleanEmail.split('@')[0]]
        )
        ticketId = newTicket.rows[0].id as string
      }
    }

    // Add the reply as a message on the ticket
    await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender, text)
       VALUES ($1, $2, $3)`,
      [ticketId, senderEmail, textBody]
    )

    // Reopen the ticket if it was resolved/closed
    await pool.query(
      `UPDATE tickets SET status = CASE WHEN status IN ('resolved', 'closed') THEN 'open' ELSE status END, updated_at = NOW()
       WHERE id = $1`,
      [ticketId]
    )

    return NextResponse.json({ ok: true, ticketId })
  } catch (err) {
    console.error('Inbound email webhook error:', err)
    return NextResponse.json({ error: 'Failed to process inbound email' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
