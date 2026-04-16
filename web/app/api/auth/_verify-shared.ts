import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export type Client = 'desktop' | 'web'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 3,
  })
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.videodj.studio'

// ---------------------------------------------------------------------------
// Human-readable error pages (rendered inline — no extra route needed).
// Used when a user clicks a desktop link in a browser, or we otherwise refuse
// to sign them in. We do NOT redirect to /login, because that would let a
// desktop token still set a web cookie via the redirect chain.
// ---------------------------------------------------------------------------

function errorPage(args: { title: string; body: string; cta?: { label: string; href: string } }): NextResponse {
  const { title, body, cta } = args
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${title} — videoDJ.Studio</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; background:#0b0b14; color:#e8e8f2; font-family:system-ui,-apple-system,'Segoe UI',sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
  .card { max-width:420px; width:100%; padding:40px 36px; border-radius:20px; background:linear-gradient(180deg,rgba(28,28,48,.85),rgba(20,20,32,.85)); border:1px solid rgba(255,255,255,.08); text-align:center; }
  h1 { color:#ffff00; font-size:20px; margin:0 0 12px; }
  p { color:#9898b8; font-size:14px; line-height:1.6; margin:0 0 24px; }
  a.btn { display:inline-block; background:#ffff00; color:#0b0b14; padding:12px 28px; border-radius:12px; font-weight:600; text-decoration:none; font-size:14px; }
</style></head><body><div class="card">
<h1>${title}</h1><p>${body}</p>
${cta ? `<a class="btn" href="${cta.href}">${cta.label}</a>` : ''}
</div></body></html>`
  return new NextResponse(html, { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

// ---------------------------------------------------------------------------
// The verify handler. Both endpoints share this core. The `expectedClient`
// argument is set by the URL, not by anything the caller provides — so a
// desktop-scoped token can ONLY be consumed by /api/auth/verify/desktop and
// a web-scoped token can ONLY be consumed by /api/auth/verify/web.
// ---------------------------------------------------------------------------

export async function handleVerify(req: NextRequest, expectedClient: Client) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return errorPage({
      title: 'Missing token',
      body: 'This sign-in link is incomplete. Request a new one.',
      cta: { label: 'Back to sign in', href: expectedClient === 'web' ? `${BASE_URL}/login` : `${BASE_URL}/desktop/login` },
    })
  }

  const pool = await getPool()

  try {
    // Ensure the client column exists so old deployments don't 500.
    await pool.query(`ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS client TEXT`)

    const linkResult = await pool.query(
      'SELECT * FROM magic_links WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [token]
    )
    const link = linkResult.rows[0]
    if (!link) {
      await pool.end()
      return errorPage({
        title: 'Link expired',
        body: 'This sign-in link has already been used or expired. Request a new one.',
        cta: { label: 'Back to sign in', href: expectedClient === 'web' ? `${BASE_URL}/login` : `${BASE_URL}/desktop/login` },
      })
    }

    // Hard separation: a token issued for a different client CANNOT sign in
    // here. We don't mark it used, so the user can still redeem it on the
    // correct side. Historical rows with NULL client default to 'web'.
    const tokenClient: Client = link.client === 'desktop' ? 'desktop' : 'web'
    if (tokenClient !== expectedClient) {
      await pool.end()
      if (expectedClient === 'web' && tokenClient === 'desktop') {
        return errorPage({
          title: 'This link is for the Desktop App',
          body: 'Open the videoDJ.Studio Desktop App and click the button in your email again from there.',
          cta: { label: 'Get the Desktop App', href: 'https://videodj.studio/download' },
        })
      }
      return errorPage({
        title: 'This link is for the Web App',
        body: 'Open app.videodj.studio in your browser and click the button in your email again from there.',
        cta: { label: 'Open Web App', href: `${BASE_URL}/login` },
      })
    }

    await pool.query('UPDATE magic_links SET used = TRUE WHERE id = $1', [link.id])

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [link.email])
    const user = userResult.rows[0]
    if (!user) {
      await pool.end()
      return errorPage({
        title: 'No account found',
        body: 'That email does not have a videoDJ.Studio account yet.',
        cta: { label: 'Sign up', href: expectedClient === 'web' ? `${BASE_URL}/signup` : `${BASE_URL}/desktop/signup` },
      })
    }

    if (user.status === 'invited') {
      await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [user.id])
    }

    await pool.query(
      'UPDATE users SET last_active = NOW(), sessions_count = sessions_count + 1 WHERE id = $1',
      [user.id]
    )

    const sessionToken = randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await pool.query(
      'INSERT INTO auth_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, sessionToken, expiresAt.toISOString()]
    )

    await pool.end()

    // Same cookie name on both sides — the cookie simply lands in whichever
    // browser session (Electron or system browser) actually opened the URL.
    const response = NextResponse.redirect(`${BASE_URL}/`)
    response.cookies.set('videodj_session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })
    return response
  } catch (err) {
    console.error(`Verify (${expectedClient}) error:`, err)
    await pool.end()
    return errorPage({
      title: 'Something went wrong',
      body: 'We could not sign you in. Try again in a moment.',
      cta: { label: 'Back to sign in', href: expectedClient === 'web' ? `${BASE_URL}/login` : `${BASE_URL}/desktop/login` },
    })
  }
}
