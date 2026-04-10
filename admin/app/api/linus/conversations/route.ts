import { NextRequest, NextResponse } from 'next/server'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  })
}

// GET — list linus conversations with user info
export async function GET(req: NextRequest) {
  const pool = await getPool()
  try {
    const { searchParams } = req.nextUrl
    const limit = parseInt(searchParams.get('limit') || '50')

    const result = await pool.query(
      `SELECT lc.id, lc.user_id, lc.summary, lc.topics, lc.actions,
              lc.message_count, lc.created_at,
              u.name as user_name, u.email
       FROM linus_conversations lc
       LEFT JOIN users u ON lc.user_id = u.id
       ORDER BY lc.created_at DESC
       LIMIT $1`,
      [limit]
    )

    // Read model config — try env vars first, then check web app config
    let provider = process.env.AGENT_PROVIDER || ''
    let model = process.env.AGENT_MODEL || ''
    let mode = process.env.AGENT_MODE || ''

    // If env vars not set (admin doesn't have AGENT_* vars), try to detect from web app
    if (!provider) {
      try {
        // Check if we can reach the web app's settings endpoint
        const webUrl = process.env.WEB_APP_URL || 'https://app.videodj.studio'
        const settingsRes = await fetch(`${webUrl}/api/settings`, { signal: AbortSignal.timeout(3000) })
        if (settingsRes.ok) {
          const settings = await settingsRes.json()
          provider = settings.agentProvider || 'anthropic'
          model = settings.agentModel || 'claude-sonnet-4-20250514'
          mode = settings.agentMode || 'apikey'
        }
      } catch {
        // Web app unreachable — use defaults
        provider = 'anthropic'
        model = 'claude-sonnet-4-20250514'
        mode = 'apikey'
      }
    }

    const modelConfig = {
      provider: provider || 'anthropic',
      model: model || 'claude-sonnet-4-20250514',
      mode: mode || 'apikey',
    }

    return NextResponse.json({
      conversations: result.rows,
      modelConfig,
    })
  } catch (err) {
    console.error('Linus conversations GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
