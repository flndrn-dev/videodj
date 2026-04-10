import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '../.env')
  const env: Record<string, string> = {}
  if (!fs.existsSync(envPath)) return env
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }
  return env
}

/**
 * POST /api/agent/summarize
 * Takes a conversation and returns a structured memory summary.
 */
export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()
    if (!messages || messages.length < 2) {
      return NextResponse.json({ success: false, error: 'Not enough messages to summarize' })
    }

    const env = loadEnv()
    const apiKey = env.CLAUDE_API_KEY || ''
    const model = env.AGENT_MODEL || 'claude-3-haiku-20240307'

    if (!apiKey || apiKey === 'your-api-key-here') {
      return NextResponse.json({ success: false, error: 'No API key' })
    }

    const conversationText = messages
      .map((m: { role: string; text: string }) => `${m.role === 'user' ? 'User' : 'Linus'}: ${m.text}`)
      .join('\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        system: `You extract key takeaways from a conversation between a DJ user and Linus (AI DJ agent).
Return ONLY a JSON object:
{
  "summary": "1-2 sentence summary of what happened",
  "topics": ["topic1", "topic2"],
  "actions": ["action1", "action2"]
}

- "summary": Brief description of the conversation
- "topics": Key topics discussed (e.g. "metadata fixing", "playlist building", "user preferences")
- "actions": Specific things that were done or decided (e.g. "User name is DJ Bodhi", "Fixed genre for 20 tracks", "User prefers 70s hard rock")

Keep it concise. Only include meaningful takeaways, not small talk.`,
        messages: [{ role: 'user', content: conversationText }],
      }),
    })

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `API error ${res.status}` })
    }

    const data = await res.json()
    const content = data.content?.[0]?.text
    if (!content) {
      return NextResponse.json({ success: false, error: 'No response' })
    }

    let raw = content.trim()
    if (raw.startsWith('```')) raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()

    try {
      const parsed = JSON.parse(raw)
      return NextResponse.json({
        success: true,
        summary: parsed.summary || '',
        topics: parsed.topics || [],
        actions: parsed.actions || [],
      })
    } catch {
      return NextResponse.json({
        success: true,
        summary: raw,
        topics: [],
        actions: [],
      })
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}
