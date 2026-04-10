import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://ghost:gh0st_s3cure_p4ss@localhost:5432/videodj_studio',
    max: 3,
  })
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const pool = await getPool()

    // Add to pre_subscribers
    await pool.query(
      `INSERT INTO pre_subscribers (email, source) VALUES ($1, 'website')
       ON CONFLICT (email) DO UPDATE SET source = 'website'`,
      [email]
    )
    await pool.end()

    // Send welcome email
    if (resend) {
      try {
        await resend.emails.send({
          from: 'videoDJ.Studio <noreply@videodj.studio>',
          to: email,
          subject: 'Welcome to videoDJ.Studio — You\'re on the early access list!',
          html: `
            <div style="background:#0a0a14;color:#f0f0f8;padding:48px 32px;font-family:system-ui,-apple-system,sans-serif;max-width:500px;margin:0 auto;border-radius:24px;">
              <div style="text-align:center;margin-bottom:40px;">
                <div style="display:inline-block;background:rgba(255,255,0,0.1);border:1px solid rgba(255,255,0,0.15);border-radius:20px;padding:16px 20px;">
                  <span style="color:#ffff00;font-size:28px;font-weight:bold;">V</span>
                </div>
              </div>

              <h1 style="color:#ffff00;font-size:22px;font-weight:600;text-align:center;margin-bottom:12px;">
                You're on the list!
              </h1>

              <p style="color:#9898b8;font-size:15px;text-align:center;line-height:1.7;margin-bottom:24px;">
                Thanks for signing up for early access to videoDJ.Studio — the AI-powered Video DJ application.
              </p>

              <div style="background:rgba(255,255,0,0.06);border:1px solid rgba(255,255,0,0.12);border-radius:16px;padding:24px;margin-bottom:24px;">
                <h2 style="color:#ffff00;font-size:16px;font-weight:600;margin-bottom:8px;text-align:center;">
                  🎁 Early Subscriber Perk
                </h2>
                <p style="color:#e8e8f2;font-size:14px;text-align:center;line-height:1.6;margin:0;">
                  As an early subscriber, you'll get <strong style="color:#ffff00;">14 days free access</strong> when we launch.
                  No credit card required.
                </p>
              </div>

              <p style="color:#9898b8;font-size:14px;text-align:center;line-height:1.6;margin-bottom:8px;">
                <strong style="color:#e8e8f2;">What happens next?</strong>
              </p>
              <p style="color:#9898b8;font-size:13px;text-align:center;line-height:1.6;margin-bottom:32px;">
                We'll email you when videoDJ.Studio is ready for production. You'll receive a magic link to sign in and start mixing immediately — with 14 days completely free.
              </p>

              <div style="text-align:center;border-top:1px solid rgba(42,42,62,0.5);padding-top:24px;">
                <p style="color:#5a5a78;font-size:11px;">
                  videoDJ.Studio — AI-Powered Video DJ & Auto-Mixing
                </p>
              </div>
            </div>
          `,
        })
      } catch (err) {
        console.error('Failed to send welcome email:', err)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Subscribe error:', err)
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
  }
}
