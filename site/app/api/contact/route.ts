import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message } = await req.json()

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    // Send to support email
    if (resend) {
      await resend.emails.send({
        from: 'videoDJ.Studio Contact <noreply@videodj.studio>',
        to: 'support@videodj.studio',
        replyTo: email,
        subject: `[${subject}] from ${name}`,
        html: `
          <div style="background:#0a0a14;color:#f0f0f8;padding:32px;font-family:system-ui,sans-serif;border-radius:16px;">
            <h2 style="color:#ffff00;margin-bottom:16px;">New Contact Form Submission</h2>
            <p><strong style="color:#9898b8;">From:</strong> ${name} (${email})</p>
            <p><strong style="color:#9898b8;">Subject:</strong> ${subject}</p>
            <hr style="border-color:#1e1e38;margin:16px 0;" />
            <p style="white-space:pre-wrap;line-height:1.6;">${message}</p>
          </div>
        `,
      })

      // Send confirmation to user
      await resend.emails.send({
        from: 'videoDJ.Studio <noreply@videodj.studio>',
        to: email,
        subject: 'We received your message — videoDJ.Studio',
        html: `
          <div style="background:#0a0a14;color:#f0f0f8;padding:32px;font-family:system-ui,sans-serif;border-radius:16px;">
            <h2 style="color:#ffff00;margin-bottom:16px;">Thanks for reaching out!</h2>
            <p style="color:#9898b8;line-height:1.6;">Hi ${name}, we received your message about "${subject}". We typically respond within 24 hours.</p>
            <p style="color:#5a5a78;font-size:12px;margin-top:24px;">— videoDJ.Studio Support</p>
          </div>
        `,
      })
    } else {
      console.log('[Contact]', { name, email, subject, message })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Contact form error:', err)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
