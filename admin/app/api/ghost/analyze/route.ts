import { NextRequest, NextResponse } from 'next/server'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:14b'

async function getPool() {
  const pg = await import('pg')
  return new pg.default.Pool({ connectionString: process.env.DATABASE_URL!, max: 3 })
}

async function askQwen(prompt: string): Promise<string> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 500 },
      }),
    })
    const data = await res.json()
    return data.response || 'No analysis available'
  } catch (err) {
    console.error('Ollama error:', err)
    return 'LLM unavailable — manual analysis required'
  }
}

// POST — trigger analysis of recent errors
export async function POST() {
  const pool = await getPool()
  try {
    // Group similar errors (by first 100 chars of message)
    const patterns = await pool.query(`
      SELECT
        LEFT(error_message, 100) as pattern,
        count(*) as count,
        MAX(severity) as max_severity,
        MAX(component) as component,
        array_agg(DISTINCT LEFT(stack_trace, 300)) as sample_stacks,
        MAX(created_at) as last_seen
      FROM app_errors
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY LEFT(error_message, 100)
      HAVING count(*) >= 2
      ORDER BY count(*) DESC
      LIMIT 10
    `)

    const proposals: unknown[] = []

    for (const row of patterns.rows) {
      const pattern = String(row.pattern)
      const count = parseInt(String(row.count))

      // Check if proposal already exists for this pattern
      const existing = await pool.query(
        'SELECT id FROM fix_proposals WHERE error_pattern = $1 AND status != $2',
        [pattern, 'rejected']
      )
      if (existing.rowCount && existing.rowCount > 0) continue

      // Ask Qwen to analyze the error and propose a fix
      const stacks = (row.sample_stacks as string[])?.filter(Boolean).slice(0, 3).join('\n---\n') || 'No stack traces'

      const prompt = `You are a senior software engineer analyzing errors in a web DJ application (videoDJ.Studio) built with Next.js, React, Web Audio API, and PostgreSQL.

Error pattern (occurred ${count} times in the last 7 days):
"${pattern}"

Component: ${row.component || 'unknown'}
Severity: ${row.max_severity || 'error'}

Sample stack traces:
${stacks}

Please provide:
1. ROOT CAUSE: A clear, non-technical explanation of what is causing this error (1-2 sentences)
2. IMPACT: How this affects the user experience (1 sentence)
3. PROPOSED FIX: A specific, actionable fix described in plain English (2-3 sentences)
4. FIX TYPE: One of: config_change, code_fix, user_guidance, skip_rule, restart_subsystem

Format your response exactly as:
ROOT CAUSE: ...
IMPACT: ...
PROPOSED FIX: ...
FIX TYPE: ...`

      const analysis = await askQwen(prompt)

      // Parse the LLM response
      const rootCause = analysis.match(/ROOT CAUSE:\s*(.+?)(?=\nIMPACT:|$)/s)?.[1]?.trim() || 'Unknown'
      const impact = analysis.match(/IMPACT:\s*(.+?)(?=\nPROPOSED FIX:|$)/s)?.[1]?.trim() || 'Unknown'
      const proposedFix = analysis.match(/PROPOSED FIX:\s*(.+?)(?=\nFIX TYPE:|$)/s)?.[1]?.trim() || 'Manual investigation needed'
      const fixType = analysis.match(/FIX TYPE:\s*(\w+)/)?.[1]?.trim() || 'config_change'

      const humanReadable = `**Why it happens:** ${rootCause}\n\n**User impact:** ${impact}\n\n**Suggested fix:** ${proposedFix}`

      await pool.query(
        `INSERT INTO fix_proposals (error_pattern, error_count, severity, component, llm_analysis, proposed_fix, proposed_fix_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [pattern, count, String(row.max_severity), String(row.component), humanReadable, proposedFix, fixType]
      )

      proposals.push({ pattern, count, fixType })
    }

    return NextResponse.json({ analyzed: patterns.rows.length, proposals: proposals.length })
  } catch (err) {
    console.error('Ghost analysis error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  } finally {
    await pool.end()
  }
}

// GET — list fix proposals
export async function GET(req: NextRequest) {
  const pool = await getPool()
  try {
    const status = req.nextUrl.searchParams.get('status') || 'all'
    let query = 'SELECT * FROM fix_proposals'
    const params: unknown[] = []

    if (status !== 'all') {
      query += ' WHERE status = $1'
      params.push(status)
    }
    query += ' ORDER BY created_at DESC LIMIT 50'

    const result = await pool.query(query, params)
    return NextResponse.json({ proposals: result.rows })
  } catch (err) {
    console.error('Proposals GET error:', err)
    return NextResponse.json({ proposals: [] })
  } finally {
    await pool.end()
  }
}

// PUT — approve or reject a proposal
export async function PUT(req: NextRequest) {
  const pool = await getPool()
  try {
    const { id, action } = await req.json() // action: 'approve' | 'reject'
    if (!id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'id and action (approve/reject) required' }, { status: 400 })
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    const result = await pool.query(
      `UPDATE fix_proposals SET status = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [newStatus, id]
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
    }

    // If approved, push the fix to Ghost's knowledge base
    if (action === 'approve') {
      const proposal = result.rows[0]
      try {
        const GHOST_URL = process.env.NEXT_PUBLIC_GHOST_URL || 'https://ghost.videodj.studio'
        const GHOST_API_KEY = process.env.NEXT_PUBLIC_GHOST_API_KEY || ''

        await fetch(`${GHOST_URL}/knowledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ghost-api-key': GHOST_API_KEY },
          body: JSON.stringify({
            error_pattern: proposal.error_pattern,
            fix_action: proposal.proposed_fix,
            fix_command_type: proposal.proposed_fix_type,
            llm_analysis: proposal.llm_analysis,
          }),
        })

        // Mark as applied
        await pool.query('UPDATE fix_proposals SET status = $1, auto_promoted = true WHERE id = $2', ['applied', id])
      } catch (ghostErr) {
        console.error('Failed to push to Ghost:', ghostErr)
        // Still approved, just not pushed to Ghost
      }
    }

    return NextResponse.json({ proposal: result.rows[0] })
  } catch (err) {
    console.error('Proposal update error:', err)
    return NextResponse.json({ error: 'Failed to update proposal' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
