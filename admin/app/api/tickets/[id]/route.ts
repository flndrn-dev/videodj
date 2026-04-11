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
    const { sender, text, isInternal } = await req.json()

    if (!sender || !text) {
      return NextResponse.json({ error: 'sender and text are required' }, { status: 400 })
    }

    // Store internal note flag in attachments JSONB
    const attachments = isInternal ? JSON.stringify({ isInternal: true }) : null

    const messageResult = await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender, text, attachments)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, sender, text, attachments]
    )

    // Update ticket's updated_at
    await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [id])

    // If sender is support and NOT an internal note, email the reply to customer
    if (!isInternal && (sender.includes('videodj') || sender.includes('support') || sender.includes('admin'))) {
      const ticketResult = await pool.query('SELECT customer_email, customer_name, subject FROM tickets WHERE id = $1', [id])
      const ticket = ticketResult.rows[0]
      if (ticket?.customer_email) {
        try {
          // Get ticket number from first message attachments
          const firstMsgResult = await pool.query(
            'SELECT attachments FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC LIMIT 1', [id]
          )
          const firstAttach = firstMsgResult.rows[0]?.attachments as Record<string, unknown> | null
          const ticketNumber = firstAttach?.ticketNumber ? String(firstAttach.ticketNumber) : null
          const subjectWithTicket = ticketNumber
            ? `Re: [${ticketNumber}] ${String(ticket.subject)}`
            : `Re: ${String(ticket.subject)}`

          const { Resend } = await import('resend')
          const resendKey = process.env.RESEND_API_KEY
          if (resendKey) {
            const resend = new Resend(resendKey)
            await resend.emails.send({
              from: 'videoDJ.Studio Support <support@videodj.studio>',
              to: String(ticket.customer_email),
              subject: subjectWithTicket,
              html: `<div style="background:#0a0a14;color:#f0f0f8;padding:32px;font-family:system-ui,sans-serif;border-radius:16px;">
                <p style="color:#9898b8;font-size:12px;margin-bottom:8px;">videoDJ.Studio Support replied:</p>
                <p style="white-space:pre-wrap;line-height:1.6;">${text}</p>
                <hr style="border-color:#1e1e38;margin:16px 0;" />
                <p style="color:#5a5a78;font-size:11px;">${ticketNumber ? `Ticket: ${ticketNumber} — ` : ''}${String(ticket.subject)}</p>
                <p style="color:#5a5a78;font-size:10px;margin-top:8px;">Reply to this email to respond.</p>
              </div>`,
            })
          }
        } catch (err) {
          console.error('Failed to send reply email:', err)
        }
      }
    }

    return NextResponse.json({ message: messageResult.rows[0] }, { status: 201 })
  } catch (err) {
    console.error('Ticket message POST error:', err)
    return NextResponse.json({ error: 'Failed to add message' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
