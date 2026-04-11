import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({ connectionString: process.env.DATABASE_URL!, max: 5 })
}

// GET — list all subscribers (pre_subscribers + newsletter)
export async function GET() {
  const pool = await getPool()
  try {
    const [preSubsResult, newsletterResult] = await Promise.all([
      pool.query('SELECT * FROM pre_subscribers ORDER BY subscribed_at DESC'),
      pool.query("SELECT * FROM pre_subscribers WHERE source = 'newsletter' ORDER BY subscribed_at DESC"),
    ])
    // Early subs = all pre_subscribers, newsletter = those with source='newsletter'
    return NextResponse.json({
      early: preSubsResult.rows,
      newsletter: newsletterResult.rows,
      totalEarly: preSubsResult.rows.length,
      totalNewsletter: newsletterResult.rows.length,
    })
  } catch (err) {
    console.error('Subscribers GET error:', err)
    return NextResponse.json({ early: [], newsletter: [], totalEarly: 0, totalNewsletter: 0 })
  } finally {
    await pool.end()
  }
}

// POST — add subscriber or perform actions
export async function POST(req: NextRequest) {
  const pool = await getPool()
  try {
    const { action, email, source, id } = await req.json()

    if (action === 'add' && email) {
      // Add new subscriber
      const result = await pool.query(
        `INSERT INTO pre_subscribers (email, source, status) VALUES ($1, $2, 'pending')
         ON CONFLICT (email) DO NOTHING RETURNING *`,
        [email, source || 'admin']
      )
      return NextResponse.json({ subscriber: result.rows[0] || null })
    }

    if (action === 'convert' && id) {
      // Convert pre-subscriber to full user with 14-day trial
      const sub = await pool.query('SELECT email FROM pre_subscribers WHERE id = $1', [id])
      if (sub.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const subEmail = String(sub.rows[0].email)
      const name = subEmail.split('@')[0]

      // Create user with 14-day trial
      const userResult = await pool.query(
        `INSERT INTO users (email, name, role, status, tier, trial_started_at)
         VALUES ($1, $2, 'subscriber', 'invited', 'free', NOW())
         ON CONFLICT (email) DO UPDATE SET trial_started_at = NOW()
         RETURNING *`,
        [subEmail, name]
      )

      // Update pre_subscriber status
      await pool.query("UPDATE pre_subscribers SET status = 'converted' WHERE id = $1", [id])

      // Send magic link invite via Resend
      try {
        const { randomBytes } = await import('crypto')
        const token = randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        await pool.query('INSERT INTO magic_links (email, token, expires_at) VALUES ($1, $2, $3)', [subEmail, token, expiresAt.toISOString()])

        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.videodj.studio'
        const resendKey = process.env.RESEND_API_KEY
        if (resendKey) {
          const { Resend } = await import('resend')
          const resend = new Resend(resendKey)
          await resend.emails.send({
            from: 'videoDJ.Studio <noreply@videodj.studio>',
            to: subEmail,
            subject: 'Your videoDJ.Studio trial is ready — 14 days free!',
            html: `<div style="background:#14141f;color:#e8e8f2;padding:48px 32px;font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;">
              <div style="text-align:center;margin-bottom:32px;"><div style="display:inline-block;background:rgba(255,255,0,0.12);border:1px solid rgba(255,255,0,0.2);border-radius:16px;padding:12px 16px;"><span style="color:#ffff00;font-size:24px;font-weight:bold;">V</span></div></div>
              <h1 style="color:#ffff00;font-size:20px;font-weight:600;text-align:center;margin-bottom:8px;">Welcome to videoDJ.Studio!</h1>
              <p style="color:#9898b8;font-size:14px;text-align:center;line-height:1.6;margin-bottom:8px;">As an early subscriber, you get <strong style="color:#e8e8f2;">14 days free</strong> (double the standard 7-day trial).</p>
              <p style="color:#9898b8;font-size:14px;text-align:center;line-height:1.6;margin-bottom:32px;">Click below to activate your account.</p>
              <div style="text-align:center;margin-bottom:32px;"><a href="${APP_URL}/api/auth/verify?token=${token}" style="display:inline-block;background:#ffff00;color:#14141f;padding:14px 40px;border-radius:12px;font-weight:600;text-decoration:none;font-size:14px;">Activate Account</a></div>
            </div>`,
          })
        }
      } catch (emailErr) {
        console.error('Failed to send invite:', emailErr)
      }

      return NextResponse.json({ user: userResult.rows[0], converted: true })
    }

    if (action === 'extend_trial' && id) {
      // Extend trial to 14 days for an existing user (find by pre_subscriber id)
      const sub = await pool.query('SELECT email FROM pre_subscribers WHERE id = $1', [id])
      if (sub.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      await pool.query(
        "UPDATE users SET trial_started_at = NOW() WHERE email = $1 AND tier = 'free'",
        [String(sub.rows[0].email)]
      )
      return NextResponse.json({ extended: true })
    }

    if (action === 'delete' && id) {
      await pool.query('DELETE FROM pre_subscribers WHERE id = $1', [id])
      return NextResponse.json({ deleted: true })
    }

    if (action === 'send_newsletter') {
      // This will be implemented in Phase B
      return NextResponse.json({ error: 'Newsletter sending not yet implemented' }, { status: 501 })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Subscribers POST error:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
