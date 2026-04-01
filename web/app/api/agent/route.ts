import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

// ---------------------------------------------------------------------------
// Load .env from project root
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Linus system prompt
// ---------------------------------------------------------------------------

function buildLinusPrompt(context: Record<string, unknown>, memories?: { timestamp: string; summary: string; topics: string[]; actions: string[] }[]): string {
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
You may receive a subset of the library (for large libraries, the client sends batches). Fix ONLY the tracks provided in context. Do your best for every single track — use your music knowledge to look up albums, genres, release years, etc.

## User's current context
${JSON.stringify(context, null, 2)}

## How to respond
Respond with a JSON object. ALWAYS use this format:
{
  "reply": "Your conversational message to the user",
  "tool_calls": [{ "tool": "tool_name", "args": { ... } }],
  "preferences": { "userName": "...", "favoriteGenres": [...], "favoriteLanguages": [...] }
}

Rules:
- "reply" is REQUIRED — always include a friendly, helpful message
- "tool_calls" is optional — only include when the user wants you to DO something
- "preferences" is optional — only include when the user shares personal info
- Keep replies concise but informative
- If the user tells you their name, remember it in preferences
- Reference actual tracks from the context when discussing the library
- For /fix commands, return update_track tool calls for EVERY track that needs fixing. Do not skip tracks.
- For playlist commands, return a reorder_playlist tool call with track_ids in order. Explain your BPM flow, key compatibility, and genre choices.
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
  source: 'api' | 'mock'
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
        max_tokens: 4096,
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
    if (!content) return null

    // Try to parse as JSON — Claude may return pure JSON, or text + JSON
    let raw = content.trim()
    if (raw.startsWith('```')) raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()

    // Strategy 1: entire response is JSON
    try {
      const parsed = JSON.parse(raw)
      return {
        reply: parsed.reply || '',
        toolCalls: (parsed.tool_calls || []).map((c: { tool: string; args?: Record<string, unknown> }) => ({ tool: c.tool, args: c.args })),
        preferences: parsed.preferences,
        source: 'api',
      }
    } catch {
      // Strategy 2: text before JSON — find the JSON object in the response
      const jsonMatch = raw.match(/\{[\s\S]*"reply"\s*:[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          // Use text before the JSON as prefix (if any), but prefer parsed.reply
          return {
            reply: parsed.reply || '',
            toolCalls: (parsed.tool_calls || []).map((c: { tool: string; args?: Record<string, unknown> }) => ({ tool: c.tool, args: c.args })),
            preferences: parsed.preferences,
            source: 'api',
          }
        } catch { /* fall through */ }
      }

      // Strategy 3: no JSON at all — treat as plain text reply
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
  try {
    const body = await req.json()
    const { text, context, conversationHistory, isWelcome, memories } = body

    if (!text && !isWelcome) {
      return NextResponse.json({ success: false, error: 'No text provided' }, { status: 400 })
    }

    const env = loadEnv()
    const provider = env.AGENT_PROVIDER || 'mock'
    const apiKey = env.CLAUDE_API_KEY || ''
    const model = env.AGENT_MODEL || 'claude-3-haiku-20240307'

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
      // Continue conversation with limited history (last 10 messages, truncate long ones)
      const recentHistory = conversationHistory.slice(-10).map((m: { role: string; text: string }) => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        // Truncate agent replies that contain JSON dumps to avoid bloating context
        content: m.role === 'agent' && m.text.length > 500 ? m.text.slice(0, 200) + '...[truncated]' : m.text,
      }))
      messages = [...recentHistory, { role: 'user', content: text }]
    } else {
      messages = [{ role: 'user', content: text }]
    }

    // Try Claude API
    const hasValidKey = (provider === 'claude' || provider === 'cli') && apiKey && apiKey !== 'your-api-key-here'
    if (hasValidKey) {
      const result = await callClaudeAPI(messages, context || {}, apiKey, model, memories)
      if (result) return NextResponse.json({ success: true, ...result })

      // API failed — for slash commands, report the error instead of mocking
      if (text && text.startsWith('/')) {
        return NextResponse.json({
          success: true,
          reply: 'API error — the request was too large or failed. Try again or use a shorter conversation history.',
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
