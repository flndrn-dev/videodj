import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const TICKET_PREFIXES: Record<string, string> = {
  'General Support': 'SUP',
  'Finance Support': 'FIN',
  'Recover Support': 'REC',
}

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({ connectionString: process.env.DATABASE_URL!, max: 3 })
}

async function generateTicketNumber(pool: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, category: string): Promise<string> {
  const prefix = TICKET_PREFIXES[category] || 'SUP'
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')

  // Count existing tickets for this prefix+date combination
  const pattern = `${prefix}-${dateStr}-%`
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM ticket_messages
     WHERE attachments::text LIKE $1`,
    [`%${pattern.replace(/%$/, '')}%`]
  )
  const seq = (parseInt(String(result.rows[0].count)) || 0) + 1
  return `${prefix}-${dateStr}-${String(seq).padStart(3, '0')}`
}

export async function POST(req: NextRequest) {
  let pool: Awaited<ReturnType<typeof getPool>> | null = null

  try {
    const { firstName, lastName, email, subject, message, category, meta } = await req.json()

    if (!firstName || !email || !subject || !message) {
      return NextResponse.json({ error: 'Required fields: firstName, email, subject, message' }, { status: 400 })
    }

    const customerName = lastName ? `${firstName} ${lastName}` : firstName
    let ticketNumber: string | null = null

    // Save to database if DATABASE_URL is set and category is provided
    if (process.env.DATABASE_URL && category) {
      try {
        pool = await getPool()
        ticketNumber = await generateTicketNumber(pool, category)

        // Insert ticket
        const ticketResult = await pool.query(
          `INSERT INTO tickets (subject, status, priority, customer_email, customer_name)
           VALUES ($1, 'open', 'medium', $2, $3)
           RETURNING id`,
          [subject, email, customerName]
        )
        const ticketId = ticketResult.rows[0].id

        // Insert first message with metadata
        const attachments = JSON.stringify({
          category,
          ticketNumber,
          meta: meta || {},
        })

        await pool.query(
          `INSERT INTO ticket_messages (ticket_id, sender, text, attachments)
           VALUES ($1, $2, $3, $4)`,
          [ticketId, email, message, attachments]
        )
      } catch (dbErr) {
        console.error('[Contact] Database error:', dbErr)
        // Continue without DB — still send emails
      }
    }

    // Send email to support
    if (resend) {
      const ticketLine = ticketNumber ? `<p><strong style="color:#9898b8;">Ticket:</strong> ${ticketNumber}</p>` : ''
      const categoryLine = category ? `<p><strong style="color:#9898b8;">Category:</strong> ${category}</p>` : ''
      const metaLine = meta ? `<p style="font-size:11px;color:#5a5a78;margin-top:16px;">IP: ${meta.ip} | Country: ${meta.country} | TZ: ${meta.timezone} | OS: ${meta.os}</p>` : ''

      await resend.emails.send({
        from: 'videoDJ.Studio Contact <noreply@videodj.studio>',
        to: 'support@videodj.studio',
        replyTo: email,
        subject: `${ticketNumber ? `[${ticketNumber}] ` : ''}${subject} — from ${customerName}`,
        html: `
          <div style="background:#0a0a14;color:#f0f0f8;padding:32px;font-family:system-ui,sans-serif;border-radius:16px;">
            <h2 style="color:#ffff00;margin-bottom:16px;">${ticketNumber ? 'New Support Ticket' : 'New Contact Form Submission'}</h2>
            ${ticketLine}
            ${categoryLine}
            <p><strong style="color:#9898b8;">From:</strong> ${customerName} (${email})</p>
            <p><strong style="color:#9898b8;">Subject:</strong> ${subject}</p>
            <hr style="border-color:#1e1e38;margin:16px 0;" />
            <p style="white-space:pre-wrap;line-height:1.6;">${message}</p>
            ${metaLine}
          </div>
        `,
      })

      // Send confirmation to user
      const userTicketLine = ticketNumber
        ? `<p style="color:#ffff00;font-weight:600;font-size:16px;margin-bottom:8px;">Ticket: ${ticketNumber}</p>`
        : ''

      await resend.emails.send({
        from: 'videoDJ.Studio <noreply@videodj.studio>',
        to: email,
        subject: ticketNumber
          ? `[${ticketNumber}] We received your support request — videoDJ.Studio`
          : 'We received your message — videoDJ.Studio',
        html: `
          <div style="background:#0a0a14;color:#f0f0f8;padding:32px;font-family:system-ui,sans-serif;border-radius:16px;">
            <h2 style="color:#ffff00;margin-bottom:16px;">Thanks for reaching out!</h2>
            ${userTicketLine}
            <p style="color:#9898b8;line-height:1.6;">Hi ${firstName}, we received your message about "${subject}". We typically respond within 24 hours.</p>
            ${ticketNumber ? `<p style="color:#9898b8;line-height:1.6;font-size:13px;">Your ticket reference is <strong style="color:#f0f0f8;">${ticketNumber}</strong>. You can use this in future correspondence.</p>` : ''}
            <p style="color:#5a5a78;font-size:12px;margin-top:24px;">— videoDJ.Studio Support</p>
          </div>
        `,
      })
    } else {
      console.log('[Contact]', { customerName, email, subject, message, category, ticketNumber, meta })
    }

    return NextResponse.json({
      success: true,
      ...(ticketNumber ? { ticketNumber } : {}),
    })
  } catch (err) {
    console.error('Contact form error:', err)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  } finally {
    if (pool) {
      try { await pool.end() } catch { /* ignore */ }
    }
  }
}
