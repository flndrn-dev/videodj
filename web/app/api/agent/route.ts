import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { loadEnvAsync } from '@/app/lib/loadEnv'
import { getClientIp, rateLimitResponse, RATE_LIMITS } from '@/app/lib/rateLimit'

// ---------------------------------------------------------------------------
// Linus system prompt
// ---------------------------------------------------------------------------

function buildLinusPrompt(context: { [key: string]: unknown }, memories?: { timestamp: string; summary: string; topics: string[]; actions: string[] }[]): string {
  const memoryBlock = memories && memories.length > 0
    ? `\n## Your memories from past conversations\nYou remember these things from previous sessions. Use them to personalize your responses:\n${memories.map(m =>
        `- [${m.timestamp.slice(0, 10)}] ${m.summary}${m.actions.length > 0 ? ` (Actions: ${m.actions.join(', ')})` : ''}`
      ).join('\n')}\n`
    : ''

  return `You are Linus, the AI DJ agent for videoDJ.Studio.

## Who you are
- Your full name is "Linus lazy AI agent" but users call you Linus
- You are a task-focused, concise AI DJ agent — not a chatbot
- You help users manage their video DJ library, build playlists, and mix music
- You speak short and direct. No fluff. Execute tasks, report results briefly.
${memoryBlock}
- You are an expert in BPM, musical keys (Camelot wheel), harmonic mixing, genre classification, and DJ techniques
- You have deep knowledge of music history: albums, release years, genres, and artists

## Tools you can execute
Include tool_calls in your response to perform actions:
- set_filter: Set or clear language filter (args: { language: "EN" | "NL" | "DE" | null })
- build_playlist: Build/rebuild the default A-Z playlist (no args needed)
- reorder_playlist: Set playlist to a specific track order (args: { track_ids: string[] }) — use this for all smart playlist building
- play: Start playback on both decks
- pause: Pause both decks
- open_folder_picker: Open file picker to add videos
- load_track: Load a track into a deck (args: { deck: "A" | "B", track_id: string })
- update_track: Update a track's metadata (args: { id: string, updates: { title?, artist?, album?, genre?, language?, released?, remixer? } })
  IMPORTANT: Do NOT include "bpm" or "key" in update_track — those are detected via client-side audio analysis, not AI lookup.

## Slash commands you handle
When the user sends a message starting with /, handle these commands:

### Library commands — Analysis (reply-only, no tool_calls)
- /scan — Analyze the FULL library from context. Count tracks with missing fields (artist, album, genre, language, bpm, key, released). Give a detailed report.
- /library-stats — Summarize: total tracks, genre distribution, language distribution, BPM range (min-max), tracks with complete vs incomplete metadata. Format as a clean report.
- /duplicates — Find tracks that appear to be duplicates (similar title+artist). List them.
- /missing — List EVERY track that has at least one missing metadata field. Show which fields are missing for each track.

### Library commands — Metadata fixing (return update_track tool_calls)
- /fix-all — For each track with missing metadata, use your music knowledge to fill: album, genre, language, released, remixer. Return update_track calls for EVERY track that needs fixing. Do NOT include bpm or key — the client handles those via audio analysis.
- /fix-titles — Find tracks where title looks like a filename or artist is empty. Use your knowledge to identify the correct title and artist. Return update_track calls.
- /fix-albums — Find tracks with missing album. Look up the correct album name for each song based on your knowledge. Return update_track calls.
- /fix-genres — Find tracks with missing genre. Classify each based on your knowledge of the artist and song. Return update_track calls.
- /fix-language — Find tracks with missing language. Detect from artist/title. Always UPPERCASE codes (EN, NL, DE, FR, ES, etc.). Return update_track calls.
- /fix-released — Find tracks with missing release year. Look up the correct year. Return update_track calls.

NOTE: /fix-bpm and /fix-keys are handled client-side via audio analysis. You will never receive these commands.

### Playlist commands (return reorder_playlist tool_call)
For ALL playlist commands, return a reorder_playlist tool_call with track_ids in your recommended order. Include ALL tracks that match the filter (don't leave any out). Explain your ordering logic in the reply.

- /playlist — Build a DJ-quality playlist from the full library. Consider BPM flow (gradual progression), Camelot key compatibility (adjacent tracks should be harmonically compatible), and genre coherence.
- /playlist-genre [genre] — Filter library to matching genre, then build smart playlist.
- /playlist-lang [lang] — Filter by language code, then build.
- /playlist-decade [decade] — Filter by release decade (80s = 1980-1989), then build.
- /playlist-bpm [min]-[max] — Filter by BPM range, then build with smooth BPM progression.
- /playlist-duration [hours] — Select tracks to fill the duration (use track durations from context). Order for DJ quality.
- /playlist-energy [curve] — Build following energy curve: "build" = low→high BPM, "peak" = consistently high BPM, "cooldown" = high→low BPM.
- /set [description] — Build a themed set matching the description (e.g. "70s number 1 hits", "summer vibes"). Select and order matching tracks.

### Streaming commands (return reorder_playlist tool_call)
- /stream [duration] — Build a streaming set for the specified duration. Optimize for smooth transitions, energy management, variety.
- /stream-theme [theme] — Build a themed streaming set. Select matching tracks, optimize for streaming.

### Help
- /about — Say your name (Linus lazy AI agent) and that you're the DJ agent for videoDJ.Studio. 2 sentences max. No feature lists.

NOTE: /next, /key-match, /bpm-match, /autoplay, /automix, /stop, /help are handled client-side. You will never receive these commands.

## Batching
You may receive a subset of the library (for large libraries, the client sends batches). Fix ONLY the tracks provided in context. You MUST return one update_track call per track. Do your best — use your music knowledge.

## User's current context
${JSON.stringify(context, null, 2)}

## How to respond
CRITICAL: Your ENTIRE response must be a single JSON object. No text before or after. No markdown.

For /fix commands, you MUST use this exact format — one update_track per track:
{"reply":"Fixed N tracks","tool_calls":[{"tool":"update_track","args":{"id":"TRACK_ID","updates":{"genre":"Rock","language":"EN","album":"Album Name","released":"1985"}}},{"tool":"update_track","args":{"id":"NEXT_ID","updates":{"genre":"Pop","language":"EN"}}}]}

Rules:
- "reply" is REQUIRED — keep it short (e.g. "Fixed 10 tracks")
- For /fix: return update_track for EVERY track in context. If you don't know a field, skip that field but still return the call with fields you DO know. NEVER skip a track entirely.
- Do NOT include "bpm" or "key" in updates — client handles those
- Language codes UPPERCASE: EN, NL, DE, FR, ES, TR, PT, KO, JA, etc.
- For /duplicates: the context has library data — compare titles/artists to find duplicates
- "preferences" is optional — only when the user shares personal info
- If the user tells you their name, include preferences with userName
- Use Camelot notation for keys (1A-12B)
- Always uppercase language codes
- You are NOT a chatbot. You are a task-solving DJ agent. Be short, direct, professional. No fluff, no long explanations unless asked.
- When the user shares their name and preferences for the first time, keep it to 1-2 SHORT sentences max. Example: "Great to meet you, [name]! If you need anything or have specific requests, you can always check the Linus commands (📖 icon)." Then STOP. Do NOT list features, do NOT suggest actions, do NOT offer to scan or fix anything. Wait for the user to ask.
- Never be pushy. Never suggest work unprompted. The user drives, you execute.`
}

// ---------------------------------------------------------------------------
// Mock fallback
// ---------------------------------------------------------------------------

interface ToolCall {
  tool: string
  args?: Record<string, unknown>
}

interface AgentResponse {
  reply: string
  toolCalls: ToolCall[]
  preferences?: Record<string, unknown>
  source: 'api' | 'mock' | 'cli'
}

function mockAgent(text: string): AgentResponse {
  const lower = text.toLowerCase()

  if (/dutch|nl\b|nederlands|holland/.test(lower)) {
    return {
      reply: 'Setting Dutch filter and building playlist.',
      toolCalls: [
        { tool: 'set_filter', args: { language: 'nl' } },
        { tool: 'build_playlist', args: { language_filter: 'nl' } },
      ],
      source: 'mock',
    }
  }

  if (/clear.*(filter|language)|remove.*(filter|language)|no filter|all (music|tracks|songs)/.test(lower)) {
    return { reply: 'Filter cleared.', toolCalls: [{ tool: 'set_filter', args: { language: null } }], source: 'mock' }
  }

  if (/mix|playlist|auto.?mix|build/.test(lower)) {
    return { reply: 'Building a new playlist.', toolCalls: [{ tool: 'build_playlist' }], source: 'mock' }
  }

  if (/scan|library|folder|video/.test(lower)) {
    return { reply: 'Opening folder picker.', toolCalls: [{ tool: 'open_folder_picker' }], source: 'mock' }
  }

  if (/stop|pause/.test(lower)) {
    return { reply: 'Paused.', toolCalls: [{ tool: 'pause' }], source: 'mock' }
  }

  if (/play|start/.test(lower)) {
    return { reply: 'Playing.', toolCalls: [{ tool: 'play' }], source: 'mock' }
  }

  return { reply: "I'm Linus, but I'm running in demo mode. Connect your API key in Settings to unlock my full potential.", toolCalls: [], source: 'mock' }
}

// ---------------------------------------------------------------------------
// Claude API call with Linus prompt
// ---------------------------------------------------------------------------

async function callClaudeAPI(
  messages: { role: string; content: string }[],
  context: Record<string, unknown>,
  apiKey: string,
  model: string,
  memories?: { timestamp: string; summary: string; topics: string[]; actions: string[] }[],
): Promise<AgentResponse | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-api-key': apiKey,
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: buildLinusPrompt(context, memories),
        messages,
      }),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error(`[Linus API] ${res.status}: ${errBody.slice(0, 200)}`)
      return null
    }

    const data = await res.json()
    const content = data.content?.[0]?.text
    const stopReason = data.stop_reason
    console.log(`[Linus API] stop_reason=${stopReason}, content_length=${content?.length || 0}`)
    if (!content) { console.error('[Linus API] No content in response'); return null }

    // Try to parse as JSON — Claude may return pure JSON, or text + JSON
    let raw = content.trim()
    console.log(`[Linus API] Raw response (first 300 chars):`, raw.slice(0, 300))
    if (raw.startsWith('```')) raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()

    // Strategy 1: entire response is JSON
    try {
      const parsed = JSON.parse(raw)
      const tc = parsed.tool_calls || []
      console.log(`[Linus API] Parsed OK — reply: ${(parsed.reply || '').slice(0, 80)}, tool_calls: ${tc.length}`)
      return {
        reply: parsed.reply || '',
        toolCalls: tc.map((c: { tool: string; args?: Record<string, unknown> }) => ({ tool: c.tool, args: c.args })),
        preferences: parsed.preferences,
        source: 'api',
      }
    } catch (parseErr) {
      console.log(`[Linus API] Strategy 1 failed: ${(parseErr as Error).message?.slice(0, 100)}`)
      // Strategy 2: find a JSON block containing "reply" — try bracket matching
      const jsonStart = raw.indexOf('{"reply"')
      const altStart = raw.indexOf('{ "reply"')
      const start = jsonStart >= 0 ? jsonStart : altStart
      if (start >= 0) {
        // Find matching closing brace by counting brackets
        let depth = 0
        let end = -1
        for (let i = start; i < raw.length; i++) {
          if (raw[i] === '{') depth++
          else if (raw[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
        }
        if (end > start) {
          try {
            const parsed = JSON.parse(raw.slice(start, end))
            return {
              reply: parsed.reply || '',
              toolCalls: (parsed.tool_calls || []).map((c: { tool: string; args?: Record<string, unknown> }) => ({ tool: c.tool, args: c.args })),
              preferences: parsed.preferences,
              source: 'api',
            }
          } catch { /* fall through */ }
        }
      }

      // Strategy 3: truncated JSON — extract whatever tool_calls we can find
      // This happens when stop_reason is 'max_tokens' — Claude ran out of output space
      const toolCallMatches = raw.matchAll(/"tool"\s*:\s*"update_track"\s*,\s*"args"\s*:\s*(\{[^}]+\})/g)
      const rescuedCalls: { tool: string; args: Record<string, unknown> }[] = []
      for (const m of toolCallMatches) {
        try {
          const args = JSON.parse(m[1])
          rescuedCalls.push({ tool: 'update_track', args })
        } catch { /* skip malformed */ }
      }
      if (rescuedCalls.length > 0) {
        console.log(`[Linus API] Strategy 3: rescued ${rescuedCalls.length} tool_calls from truncated JSON`)
        return { reply: 'Processing...', toolCalls: rescuedCalls, source: 'api' }
      }

      // Strategy 4: no JSON at all — treat as plain text reply
      console.log(`[Linus API] Strategy 4: plain text (no tool_calls found)`)
      return { reply: content, toolCalls: [], source: 'api' }
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Claude CLI call (subscription mode — no API key, uses claude binary)
// ---------------------------------------------------------------------------

async function callClaudeCLI(
  messages: { role: string; content: string }[],
  context: Record<string, unknown>,
  memories?: { timestamp: string; summary: string; topics: string[]; actions: string[] }[],
): Promise<AgentResponse | null> {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const exec = promisify(execFile)
  const fs = await import('fs')

  // Find claude binary
  const cliPaths = ['/usr/local/bin/claude', '/opt/homebrew/bin/claude']
  let claudePath = ''
  for (let i = 0; i < cliPaths.length; i++) {
    if (fs.existsSync(cliPaths[i])) { claudePath = cliPaths[i]; break }
  }
  if (!claudePath) {
    try {
      const { stdout } = await exec('which', ['claude'])
      claudePath = stdout.trim()
    } catch { return null }
  }

  // Build the full prompt with system context
  const systemPrompt = buildLinusPrompt(context, memories)
  const lastMessage = messages[messages.length - 1]?.content || ''
  const fullPrompt = `${systemPrompt}\n\n---\nUser message:\n${lastMessage}`

  try {
    const { stdout } = await exec(claudePath, ['--print'], {
      timeout: 60000,
      input: fullPrompt,
    } as Parameters<typeof exec>[2] & { input: string })

    const content = String(stdout).trim()
    if (!content) return null

    // Parse response (same as API — Linus returns JSON)
    let raw = content
    if (raw.startsWith('```')) raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()

    try {
      const parsed = JSON.parse(raw)
      return {
        reply: parsed.reply || '',
        toolCalls: (parsed.tool_calls || []).map((c: { tool: string; args?: Record<string, unknown> }) => ({ tool: c.tool, args: c.args })),
        preferences: parsed.preferences,
        source: 'cli',
      }
    } catch {
      // Find JSON block
      const start = raw.indexOf('{"reply"')
      const altStart = raw.indexOf('{ "reply"')
      const jsonStart = start >= 0 ? start : altStart
      if (jsonStart >= 0) {
        let depth = 0, end = -1
        for (let i = jsonStart; i < raw.length; i++) {
          if (raw[i] === '{') depth++
          else if (raw[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
        }
        if (end > jsonStart) {
          try {
            const parsed = JSON.parse(raw.slice(jsonStart, end))
            return {
              reply: parsed.reply || '',
              toolCalls: (parsed.tool_calls || []).map((c: { tool: string; args?: Record<string, unknown> }) => ({ tool: c.tool, args: c.args })),
              preferences: parsed.preferences,
              source: 'cli',
            }
          } catch { /* fall through */ }
        }
      }

      // Truncated JSON — rescue tool_calls
      const toolCallMatches = raw.matchAll(/"tool"\s*:\s*"update_track"\s*,\s*"args"\s*:\s*(\{[^}]+\})/g)
      const rescuedCalls: { tool: string; args: Record<string, unknown> }[] = []
      for (const m of toolCallMatches) {
        try { rescuedCalls.push({ tool: 'update_track', args: JSON.parse(m[1]) }) } catch { /* skip */ }
      }
      if (rescuedCalls.length > 0) return { reply: 'Processing...', toolCalls: rescuedCalls, source: 'cli' }

      // Plain text
      return { reply: content, toolCalls: [], source: 'cli' }
    }
  } catch (e) {
    console.error('[Linus CLI] Error:', (e as Error).message?.slice(0, 200))
    return null
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible API call (OpenAI, xAI, DeepSeek, Google, Custom)
// ---------------------------------------------------------------------------

async function callOpenAICompatibleAPI(
  messages: { role: string; content: string }[],
  context: Record<string, unknown>,
  apiKey: string,
  endpoint: string,
  model: string,
  memories?: { timestamp: string; summary: string; topics: string[]; actions: string[] }[],
): Promise<AgentResponse | null> {
  try {
    const systemPrompt = buildLinusPrompt(context, memories)
    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages: allMessages,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error(`[Linus API] ${res.status}: ${errBody.slice(0, 200)}`)
      return null
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) { console.error('[Linus API] No content in response'); return null }

    // Parse response (same logic as Claude — Linus returns JSON)
    let raw = content.trim()
    console.log(`[Linus API] Raw response (first 300 chars):`, raw.slice(0, 300))
    if (raw.startsWith('```')) raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()

    // Try JSON parse
    try {
      const parsed = JSON.parse(raw)
      return {
        reply: parsed.reply || '',
        toolCalls: (parsed.tool_calls || []).map((c: { tool: string; args?: Record<string, unknown> }) => ({ tool: c.tool, args: c.args })),
        preferences: parsed.preferences,
        source: 'api',
      }
    } catch {
      // Find JSON block
      const start = raw.indexOf('{"reply"')
      const altStart = raw.indexOf('{ "reply"')
      const jsonStart = start >= 0 ? start : altStart
      if (jsonStart >= 0) {
        let depth = 0, end = -1
        for (let i = jsonStart; i < raw.length; i++) {
          if (raw[i] === '{') depth++
          else if (raw[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
        }
        if (end > jsonStart) {
          try {
            const parsed = JSON.parse(raw.slice(jsonStart, end))
            return {
              reply: parsed.reply || '',
              toolCalls: (parsed.tool_calls || []).map((c: { tool: string; args?: Record<string, unknown> }) => ({ tool: c.tool, args: c.args })),
              preferences: parsed.preferences,
              source: 'api',
            }
          } catch { /* fall through */ }
        }
      }

      // Truncated JSON — rescue tool_calls
      const toolCallMatches = raw.matchAll(/"tool"\s*:\s*"update_track"\s*,\s*"args"\s*:\s*(\{[^}]+\})/g)
      const rescuedCalls: { tool: string; args: Record<string, unknown> }[] = []
      for (const m of toolCallMatches) {
        try { rescuedCalls.push({ tool: 'update_track', args: JSON.parse(m[1]) }) } catch { /* skip */ }
      }
      if (rescuedCalls.length > 0) return { reply: 'Processing...', toolCalls: rescuedCalls, source: 'api' }

      // Plain text
      return { reply: content, toolCalls: [], source: 'api' }
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// POST /api/agent
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(getClientIp(req), RATE_LIMITS.agent)
  if (limited) return limited

  try {
    const body = await req.json()
    const { text, context, conversationHistory, isWelcome, memories } = body

    if (!text && !isWelcome) {
      return NextResponse.json({ success: false, error: 'No text provided' }, { status: 400 })
    }

    const env = await loadEnvAsync()
    const mode = env.AGENT_MODE || 'apikey'
    const provider = env.AGENT_PROVIDER || 'anthropic'
    const apiKey = env.AGENT_API_KEY || env.CLAUDE_API_KEY || ''
    const endpoint = env.AGENT_ENDPOINT || ''
    const model = env.AGENT_MODEL || 'claude-sonnet-4-20250514'

    // Build messages array
    let messages: { role: string; content: string }[]

    if (isWelcome) {
      // Welcome message — Linus introduces himself
      // Use minimal context so the AI focuses on the introduction
      messages = [{
        role: 'user',
        content: `[SYSTEM: The user just connected. Introduce yourself in 2 SHORT sentences max. Say your name is Linus, ask their name and what music they're into. Nothing else. No feature lists, no suggestions, no offers to help. Just the intro.]`,
      }]
    } else if (conversationHistory && conversationHistory.length > 0) {
      // Continue conversation with limited history (last 6 messages, truncate long ones)
      const recentHistory = conversationHistory.slice(-6).map((m: { role: string; text: string }) => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        // Truncate long messages to avoid blowing context window
        content: m.text.length > 300 ? m.text.slice(0, 150) + '...' : m.text,
      }))
      messages = [...recentHistory, { role: 'user', content: text }]
    } else {
      messages = [{ role: 'user', content: text }]
    }

    // Try AI provider
    const hasValidKey = apiKey && apiKey.length > 10 && apiKey !== 'your-api-key-here'
    if (hasValidKey || mode === 'subscription') {
      let result: AgentResponse | null = null

      if (mode === 'subscription') {
        // Use Claude CLI (subscription — no API key needed)
        result = await callClaudeCLI(messages, context || {}, memories)
      } else if (provider === 'anthropic') {
        // Anthropic uses its own API format
        result = await callClaudeAPI(messages, context || {}, apiKey, model, memories)
      } else {
        // OpenAI-compatible providers (OpenAI, xAI, DeepSeek, Google, Ollama, Custom)
        const defaultEndpoints: Record<string, string> = {
          openai: 'https://api.openai.com/v1/chat/completions',
          xai: 'https://api.x.ai/v1/chat/completions',
          deepseek: 'https://api.deepseek.com/v1/chat/completions',
          google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
          ollama: 'http://187.124.64.116:11434/v1/chat/completions',
        }
        const defaultModels: Record<string, string> = {
          openai: 'gpt-4o', xai: 'grok-3', deepseek: 'deepseek-chat', google: 'gemini-2.5-pro',
          ollama: 'qwen2.5-coder:14b',
        }
        let ep = endpoint || defaultEndpoints[provider] || endpoint
        // Ollama: user enters base URL (e.g. http://host:11434) — append /v1/chat/completions
        if (provider === 'ollama' && ep && !ep.includes('/v1/')) {
          ep = ep.replace(/\/+$/, '') + '/v1/chat/completions'
        }
        const mdl = model || defaultModels[provider] || 'gpt-4o'
        if (ep) {
          result = await callOpenAICompatibleAPI(messages, context || {}, apiKey, ep, mdl, memories)
        }
      }

      if (result) return NextResponse.json({ success: true, ...result })

      // API failed
      if (text && text.startsWith('/')) {
        return NextResponse.json({
          success: true,
          reply: 'API error — the request failed. Check your API key and provider settings.',
          toolCalls: [],
          source: 'api',
        })
      }
    }

    // Mock fallback (only for users without API key)
    if (isWelcome) {
      return NextResponse.json({
        success: true,
        reply: "Hey! I'm Linus, your AI DJ agent. I'm running in demo mode right now — connect your Claude API key in Settings to unlock my full potential. In the meantime, I can handle basic commands like 'build a playlist' or 'play dutch music'.",
        toolCalls: [],
        source: 'mock',
      })
    }

    return NextResponse.json({ success: true, ...mockAgent(text) })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}
