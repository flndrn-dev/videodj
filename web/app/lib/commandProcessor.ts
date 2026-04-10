/**
 * Client-side command processor for Linus slash commands.
 * Intercepts commands before they hit the Claude API.
 * Handles client-only commands (audio analysis, mixing, autoplay)
 * and passes through Claude-dependent commands.
 */

import type { Track, DeckState } from '@/app/hooks/usePlayerStore'
import { getTrackBlob } from '@/app/lib/db'
import { detectBPM, detectKey } from '@/app/lib/extractMetadata'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingUpdate {
  trackId: string
  trackTitle: string
  trackArtist: string
  changes: Partial<Track>
  source: 'claude' | 'audio-analysis'
}

export interface CommandResult {
  /** Was this fully handled client-side? */
  handled: boolean
  /** Should we still send to Claude API? */
  passToAgent: boolean
  /** Immediate reply text */
  reply?: string
  /** Updates awaiting user confirmation */
  pendingUpdates?: PendingUpdate[]
  /** Action to trigger in the parent */
  action?: 'autoplay_start' | 'autoplay_stop' | 'automix_start' | 'automix_playlist' | 'open_help' | 'start_recording' | 'stop_recording' | 'show_set_history' | 'load_next' | 'set_playlist' | 'health_results'
  /** Suggested tracks from /next (for queue + load) */
  nextTracks?: Track[]
  /** Auto-generated playlist name */
  playlistName?: string
  /** Bad files from /health check — id + reason for flagging */
  healthBadIds?: string[]
  healthBadReasons?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Camelot Wheel — harmonic mixing compatibility
// ---------------------------------------------------------------------------

/**
 * Returns all Camelot keys that are harmonically compatible with the given key.
 * Compatible = same key, ±1 same letter, same number opposite letter.
 */
export function getCamelotCompatible(key: string): string[] {
  if (!key || key.length < 2) return []

  const match = key.match(/^(\d{1,2})([AB])$/i)
  if (!match) return []

  const num = parseInt(match[1])
  const letter = match[2].toUpperCase()
  if (num < 1 || num > 12 || (letter !== 'A' && letter !== 'B')) return []

  const compatible: string[] = [
    `${num}${letter}`,                              // same key
    `${num === 1 ? 12 : num - 1}${letter}`,        // -1 same letter
    `${num === 12 ? 1 : num + 1}${letter}`,        // +1 same letter
    `${num}${letter === 'A' ? 'B' : 'A'}`,         // same number opposite letter
  ]

  return compatible
}

/**
 * Get compatibility label for a key relative to a reference key.
 */
function getKeyCompatLabel(refKey: string, testKey: string): string {
  if (!refKey || !testKey) return ''
  if (refKey === testKey) return 'same key'

  const refMatch = refKey.match(/^(\d{1,2})([AB])$/i)
  const testMatch = testKey.match(/^(\d{1,2})([AB])$/i)
  if (!refMatch || !testMatch) return ''

  const refNum = parseInt(refMatch[1])
  const refLetter = refMatch[2].toUpperCase()
  const testNum = parseInt(testMatch[1])
  const testLetter = testMatch[2].toUpperCase()

  if (refNum === testNum && refLetter !== testLetter) return 'opposite mode'
  if (refLetter === testLetter) {
    const diff = testNum - refNum
    if (diff === 1 || diff === -11) return '+1 key'
    if (diff === -1 || diff === 11) return '-1 key'
  }
  return 'compatible'
}

// ---------------------------------------------------------------------------
// BPM matching
// ---------------------------------------------------------------------------

const BPM_RANGE = 15

function getBpmMatches(library: Track[], currentTrack: Track, excludeIds: string[]): Track[] {
  const exclude = new Set(excludeIds)
  return library
    .filter(t => !exclude.has(t.id) && t.bpm > 0 && currentTrack.bpm > 0 && Math.abs(t.bpm - currentTrack.bpm) <= BPM_RANGE)
    .sort((a, b) => Math.abs(a.bpm - currentTrack.bpm) - Math.abs(b.bpm - currentTrack.bpm))
}

// ---------------------------------------------------------------------------
// Get active deck's track
// ---------------------------------------------------------------------------

function getActiveTrack(deckA: DeckState, deckB: DeckState, crossfader: number): Track | null {
  if (crossfader < 50) return deckA.track
  if (crossfader > 50) return deckB.track
  // At center, prefer the playing deck
  if (deckA.playing && !deckB.playing) return deckA.track
  if (deckB.playing && !deckA.playing) return deckB.track
  return deckA.track || deckB.track
}

// ---------------------------------------------------------------------------
// Audio analysis commands (client-side)
// ---------------------------------------------------------------------------

async function processFixBpm(
  library: Track[],
  onProgress?: (message: string) => void,
): Promise<CommandResult> {
  const needsFix = library.filter(t => !t.bpm || t.bpm === 0)

  if (needsFix.length === 0) {
    return { handled: true, passToAgent: false, reply: 'All tracks already have BPM data.' }
  }

  onProgress?.(`Found ${needsFix.length} tracks with missing BPM. Starting audio analysis...`)
  const updates: PendingUpdate[] = []

  for (let i = 0; i < needsFix.length; i++) {
    const track = needsFix[i]
    onProgress?.(`Analyzing BPM... track ${i + 1}/${needsFix.length}: ${track.artist || 'Unknown'} - ${track.title}`)

    const blob = await getTrackBlob(track.id)
    if (!blob) {
      onProgress?.(`Skipping ${track.title} — no audio data stored`)
      continue
    }

    const file = new File([blob], track.file || 'track.mp4', { type: blob.type || 'video/mp4' })
    const bpm = await detectBPM(file)

    if (bpm > 0) {
      updates.push({
        trackId: track.id,
        trackTitle: track.title,
        trackArtist: track.artist,
        changes: { bpm },
        source: 'audio-analysis',
      })
    }
  }

  if (updates.length === 0) {
    return { handled: true, passToAgent: false, reply: `Analyzed ${needsFix.length} tracks but could not detect BPM for any of them.` }
  }

  const summary = updates.map((u, i) => `${i + 1}. ${u.trackArtist || 'Unknown'} — ${u.trackTitle}: ${u.changes.bpm} BPM`).join('\n')
  return {
    handled: true,
    passToAgent: false,
    reply: `Detected BPM for ${updates.length}/${needsFix.length} tracks:\n${summary}\n\nType "apply" to save these changes, or "cancel" to discard.`,
    pendingUpdates: updates,
  }
}

async function processFixKeys(
  library: Track[],
  onProgress?: (message: string) => void,
): Promise<CommandResult> {
  const needsFix = library.filter(t => !t.key || t.key === '')

  if (needsFix.length === 0) {
    return { handled: true, passToAgent: false, reply: 'All tracks already have key data.' }
  }

  onProgress?.(`Found ${needsFix.length} tracks with missing key. Starting audio analysis...`)
  const updates: PendingUpdate[] = []

  for (let i = 0; i < needsFix.length; i++) {
    const track = needsFix[i]
    onProgress?.(`Analyzing key... track ${i + 1}/${needsFix.length}: ${track.artist || 'Unknown'} - ${track.title}`)

    const blob = await getTrackBlob(track.id)
    if (!blob) {
      onProgress?.(`Skipping ${track.title} — no audio data stored`)
      continue
    }

    const file = new File([blob], track.file || 'track.mp4', { type: blob.type || 'video/mp4' })
    const key = await detectKey(file)

    if (key) {
      updates.push({
        trackId: track.id,
        trackTitle: track.title,
        trackArtist: track.artist,
        changes: { key },
        source: 'audio-analysis',
      })
    }
  }

  if (updates.length === 0) {
    return { handled: true, passToAgent: false, reply: `Analyzed ${needsFix.length} tracks but could not detect key for any of them.` }
  }

  const summary = updates.map((u, i) => `${i + 1}. ${u.trackArtist || 'Unknown'} — ${u.trackTitle}: ${u.changes.key}`).join('\n')
  return {
    handled: true,
    passToAgent: false,
    reply: `Detected key for ${updates.length}/${needsFix.length} tracks:\n${summary}\n\nType "apply" to save these changes, or "cancel" to discard.`,
    pendingUpdates: updates,
  }
}

// ---------------------------------------------------------------------------
// Mixing commands (client-side)
// ---------------------------------------------------------------------------

function processNext(library: Track[], deckA: DeckState, deckB: DeckState, crossfader: number): CommandResult {
  const current = getActiveTrack(deckA, deckB, crossfader)
  if (!current) {
    return { handled: true, passToAgent: false, reply: 'No track is currently loaded. Load a track first.' }
  }

  const excludeIds = [current.id, deckA.track?.id, deckB.track?.id].filter(Boolean) as string[]
  const compatibleKeys = getCamelotCompatible(current.key)

  // Find tracks that match both BPM and key
  const bpmMatches = getBpmMatches(library, current, excludeIds)
  const fullMatches = bpmMatches.filter(t => compatibleKeys.includes(t.key))
  const bpmOnlyMatches = bpmMatches.filter(t => !compatibleKeys.includes(t.key))

  const nextTracks: Track[] = []
  const suggestions: string[] = []

  // Priority 1: BPM + Key match
  for (const t of fullMatches.slice(0, 5)) {
    const label = getKeyCompatLabel(current.key, t.key)
    suggestions.push(`${t.artist || 'Unknown'} — ${t.title} (${t.bpm} BPM, ${t.key}) [${label}]`)
    nextTracks.push(t)
  }

  // Fill remaining with BPM-only matches
  if (suggestions.length < 5) {
    for (const t of bpmOnlyMatches.slice(0, 5 - suggestions.length)) {
      suggestions.push(`${t.artist || 'Unknown'} — ${t.title} (${t.bpm} BPM, ${t.key || 'no key'}) [BPM match only]`)
      nextTracks.push(t)
    }
  }

  if (suggestions.length === 0) {
    return { handled: true, passToAgent: false, reply: `No compatible tracks found for "${current.title}" (${current.bpm} BPM, ${current.key}).` }
  }

  const header = `Based on "${current.title}" by ${current.artist || 'Unknown'} (${current.bpm} BPM, ${current.key}):\n`
  const list = suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')
  return { handled: true, passToAgent: false, reply: header + list + '\n\n[NEXT_TRACKS]', nextTracks, action: 'load_next' }
}

function processKeyMatch(library: Track[], deckA: DeckState, deckB: DeckState, crossfader: number): CommandResult {
  const current = getActiveTrack(deckA, deckB, crossfader)
  if (!current) {
    return { handled: true, passToAgent: false, reply: 'No track is currently loaded. Load a track first.' }
  }
  if (!current.key) {
    return { handled: true, passToAgent: false, reply: `"${current.title}" has no key data. Run /fix-keys first.` }
  }

  const compatibleKeys = getCamelotCompatible(current.key)
  const excludeIds = [current.id, deckA.track?.id, deckB.track?.id].filter(Boolean) as string[]
  const exclude = new Set(excludeIds)

  const matches = library
    .filter(t => !exclude.has(t.id) && t.key && compatibleKeys.includes(t.key))
    .sort((a, b) => a.title.localeCompare(b.title))

  if (matches.length === 0) {
    return { handled: true, passToAgent: false, reply: `No harmonically compatible tracks found for key ${current.key}.` }
  }

  const header = `Tracks compatible with "${current.title}" (${current.key}):\n`
  const list = matches.map((t, i) => {
    const label = getKeyCompatLabel(current.key, t.key)
    return `${i + 1}. ${t.artist || 'Unknown'} — ${t.title} (${t.bpm} BPM, ${t.key}) [${label}]`
  }).join('\n')
  return { handled: true, passToAgent: false, reply: header + list }
}

function processBpmMatch(library: Track[], deckA: DeckState, deckB: DeckState, crossfader: number): CommandResult {
  const current = getActiveTrack(deckA, deckB, crossfader)
  if (!current) {
    return { handled: true, passToAgent: false, reply: 'No track is currently loaded. Load a track first.' }
  }
  if (!current.bpm || current.bpm === 0) {
    return { handled: true, passToAgent: false, reply: `"${current.title}" has no BPM data. Run /fix-bpm first.` }
  }

  const excludeIds = [current.id, deckA.track?.id, deckB.track?.id].filter(Boolean) as string[]
  const matches = getBpmMatches(library, current, excludeIds)

  if (matches.length === 0) {
    return { handled: true, passToAgent: false, reply: `No tracks within ±${BPM_RANGE} BPM of ${current.bpm}.` }
  }

  const header = `Tracks within ±${BPM_RANGE} BPM of "${current.title}" (${current.bpm} BPM):\n`
  const list = matches.map((t, i) =>
    `${i + 1}. ${t.artist || 'Unknown'} — ${t.title} (${t.bpm} BPM, ${t.key || 'no key'}) [${t.bpm > current.bpm ? '+' : ''}${t.bpm - current.bpm} BPM]`
  ).join('\n')
  return { handled: true, passToAgent: false, reply: header + list }
}

// ---------------------------------------------------------------------------
// Smart playlist builder (client-side, Camelot + BPM flow)
// ---------------------------------------------------------------------------

function processPlaylist(command: string, library: Track[]): CommandResult {
  if (library.length === 0) {
    return { handled: true, passToAgent: false, reply: 'Library is empty. Upload some tracks first.' }
  }

  // Normalize: strip the /command part, keep everything after as args
  const args = command.replace(/^\/(playlist-?\w*|set|stream-?\w*)\s*/i, '').trim().toLowerCase()
  const cmdBase = command.trim().toLowerCase().split(/\s+/)[0]

  let filtered = [...library]
  const filters: string[] = []
  let targetDurationSec = 0

  // --- Parse duration: "2hr", "2h", "90min", "3hours" ---
  const durMatch = args.match(/(\d+\.?\d*)\s*(hr|h|hours?|min|minutes?|m)\b/)
  if (durMatch) {
    const val = parseFloat(durMatch[1])
    const unit = durMatch[2]
    if (unit.startsWith('h')) targetDurationSec = val * 3600
    else targetDurationSec = val * 60
    filters.push(`duration: ~${durMatch[0]}`)
  }
  // Also handle /playlist-duration directly
  if (cmdBase === '/playlist-duration') {
    const num = parseFloat(args)
    if (num > 0) { targetDurationSec = num * 3600; filters.push(`duration: ~${num}h`) }
  }

  // --- Parse BPM range: "120-140" or /playlist-bpm ---
  const bpmMatch = args.match(/(\d{2,3})\s*-\s*(\d{2,3})/)
  if (bpmMatch || cmdBase === '/playlist-bpm') {
    const m = bpmMatch || args.match(/(\d{2,3})\s*-\s*(\d{2,3})/)
    if (m) {
      const lo = parseInt(m[1]), hi = parseInt(m[2])
      const bpmFiltered = filtered.filter(t => t.bpm >= lo && t.bpm <= hi)
      if (bpmFiltered.length > 0) { filtered = bpmFiltered; filters.push(`BPM: ${lo}-${hi}`) }
    }
  }

  // --- Parse decade: "70s", "80s", "90s", "00s" ---
  const decadeMatch = args.match(/(\d{2})s/)
  if (decadeMatch || cmdBase === '/playlist-decade') {
    const dm = decadeMatch || args.match(/(\d{2})/)
    if (dm) {
      const decade = parseInt(dm[1])
      const startYear = decade < 30 ? 2000 + decade : 1900 + decade
      const endYear = startYear + 9
      const decadeFiltered = filtered.filter(t => {
        const year = parseInt(t.released)
        return year >= startYear && year <= endYear
      })
      if (decadeFiltered.length > 0) { filtered = decadeFiltered; filters.push(`${dm[1]}s (${startYear}-${endYear})`) }
    }
  }

  // --- Parse language: "language ES", "lang NL", "EN", or /playlist-lang ---
  const langPrefixMatch = args.match(/\b(?:language|lang)\s+([a-z]{2,3})\b/i)
  const bareLanguageCode = !langPrefixMatch ? args.match(/\b([a-z]{2})\b/i) : null
  const detectedLang = langPrefixMatch?.[1]?.toUpperCase()
    || (cmdBase === '/playlist-lang' ? args.trim().toUpperCase() : null)
    || (bareLanguageCode && bareLanguageCode[1].toUpperCase() === bareLanguageCode[1] ? bareLanguageCode[1] : null)

  if (detectedLang && detectedLang.length >= 2 && detectedLang.length <= 3) {
    const langFiltered = filtered.filter(t => (t.language || '').toUpperCase() === detectedLang)
    if (langFiltered.length > 0) { filtered = langFiltered; filters.push(`language: ${detectedLang}`) }
  }

  // --- Parse energy curve: "build", "peak", "cooldown" or /playlist-energy ---
  if (cmdBase === '/playlist-energy') {
    const curve = args.trim()
    if (curve) filters.push(`energy: ${curve}`)
  }

  // --- Parse genre keywords from remaining args ---
  // Strip already-parsed tokens (decade, duration, bpm range, stop words)
  const stopWords = 'with|and|some|random|music|included|generate|me|a|playlist|from|the|as|base|of|for|about|set|stream|theme|party|night|session|mix|live|language|lang'
  const cleanArgs = args
    .replace(/\d+\.?\d*\s*(hr|h|hours?|min|minutes?|m)\b/g, '')
    .replace(/\d{2,3}\s*-\s*\d{2,3}/g, '')
    .replace(/\d{2}s/g, '')
    .replace(/\b(?:language|lang)\s+[a-z]{2,3}\b/gi, '') // strip "language ES"
    .replace(/\b[A-Z]{2}\b/g, '') // strip bare 2-letter uppercase codes
    .trim()
  const genreRegex = new RegExp(`\\b(${stopWords})\\b`, 'gi')
  const genreKeywords = cleanArgs.replace(genreRegex, '').trim().split(/\s+/).filter(w => w.length > 2)

  // Also handle /playlist-genre directly
  if (cmdBase === '/playlist-genre') {
    const g = args.trim()
    if (g) genreKeywords.push(...g.split(/\s+/).filter(w => w.length > 1))
  }

  if (genreKeywords.length > 0) {
    const genreFiltered = filtered.filter(t => {
      const g = (t.genre || '').toLowerCase()
      const a = (t.artist || '').toLowerCase()
      const title = (t.title || '').toLowerCase()
      return genreKeywords.some(kw => g.includes(kw) || a.includes(kw) || title.includes(kw))
    })
    if (genreFiltered.length > 0) {
      const genreIds = new Set(genreFiltered.map(t => t.id))
      const others = filtered.filter(t => !genreIds.has(t.id))
      // Shuffle others
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[others[i], others[j]] = [others[j], others[i]]
      }
      filtered = [...genreFiltered, ...others]
      filters.push(`genre: ${genreKeywords.join(', ')}`)
    }
  }

  // Build playlist using greedy nearest-neighbor on BPM + key compatibility
  const remaining = new Set(filtered.map(t => t.id))
  const trackMap = new Map(filtered.map(t => [t.id, t]))
  const ordered: Track[] = []

  // Random opener for variety
  const startIdx = Math.floor(Math.random() * filtered.length)
  let current = filtered[startIdx]

  ordered.push(current)
  remaining.delete(current.id)

  while (remaining.size > 0) {
    const compatKeys = getCamelotCompatible(current.key)
    let bestScore = -Infinity
    let bestTrack: Track | null = null

    for (const id of remaining) {
      const t = trackMap.get(id)!
      let score = 0

      // BPM proximity (closer = better, max 40 points)
      if (t.bpm > 0 && current.bpm > 0) {
        const bpmDiff = Math.abs(t.bpm - current.bpm)
        score += Math.max(0, 40 - bpmDiff * 2)
      }

      // Key compatibility (30 points for compatible)
      if (t.key && compatKeys.includes(t.key)) {
        score += 30
        if (t.key === current.key) score += 10
      }

      // Genre match (10 points)
      if (t.genre && t.genre === current.genre) score += 10

      // Add randomness to prevent identical ordering
      score += Math.random() * 8

      if (score > bestScore) {
        bestScore = score
        bestTrack = t
      }
    }

    if (!bestTrack) {
      const nextId = remaining.values().next().value
      if (nextId) bestTrack = trackMap.get(nextId)!
      else break
    }

    ordered.push(bestTrack)
    remaining.delete(bestTrack.id)
    current = bestTrack
  }

  // Trim to target duration if specified
  if (targetDurationSec > 0) {
    let cumDur = 0
    const trimmed: Track[] = []
    for (const t of ordered) {
      cumDur += t.duration || 180
      trimmed.push(t)
      if (cumDur >= targetDurationSec) break
    }
    ordered.length = 0
    ordered.push(...trimmed)
  }

  // Build summary
  const totalDur = ordered.reduce((s, t) => s + (t.duration || 0), 0)
  const hours = Math.floor(totalDur / 3600)
  const mins = Math.floor((totalDur % 3600) / 60)
  const durStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`

  const genres = new Map<string, number>()
  for (const t of ordered) {
    if (t.genre) genres.set(t.genre, (genres.get(t.genre) || 0) + 1)
  }
  const topGenres = [...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g, c]) => `${g} (${c})`).join(', ')

  const filterInfo = filters.length > 0 ? `Filters: ${filters.join(' + ')}\n` : ''
  const preview = ordered.slice(0, 10).map((t, i) =>
    `${i + 1}. ${t.artist || 'Unknown'} — ${t.title} (${t.bpm} BPM, ${t.key || '?'})`
  ).join('\n')

  // Auto-generate a fitting playlist name from the filters
  const nameParts: string[] = []
  // Extract decade
  const decadeInFilter = filters.find(f => f.match(/\d{2}s/))
  if (decadeInFilter) nameParts.push(decadeInFilter.replace(/\(.*\)/, '').trim())
  // Extract genre
  const genreInFilter = filters.find(f => f.startsWith('genre:'))
  if (genreInFilter) nameParts.push(genreInFilter.replace('genre: ', '').split(',')[0].trim())
  // Extract top genre if no filter genre
  if (!genreInFilter && topGenres) nameParts.push([...genres.entries()].sort((a, b) => b[1] - a[1])[0][0])
  // Duration
  const durInFilter = filters.find(f => f.startsWith('duration:'))
  if (durInFilter) nameParts.push(durInFilter.replace('duration: ~', ''))
  // Energy
  const energyInFilter = filters.find(f => f.startsWith('energy:'))
  if (energyInFilter) nameParts.push(energyInFilter.replace('energy: ', '') + ' energy')

  const playlistName = nameParts.length > 0
    ? `${nameParts.join(' ')} Mix`
    : `Smart Mix — ${durStr}`

  const reply = `Built playlist: "${playlistName}" — ${ordered.length} tracks, ${durStr}\n` +
    filterInfo +
    `Genres: ${topGenres}\n\n` +
    `First 10:\n${preview}` +
    (ordered.length > 10 ? `\n... and ${ordered.length - 10} more` : '') +
    '\n\n[PLAYLIST_ACTIONS]'

  return {
    handled: true,
    passToAgent: false,
    reply,
    action: 'set_playlist',
    nextTracks: ordered,
    playlistName,
  }
}

// ---------------------------------------------------------------------------
// Duplicates — find and list duplicate tracks with delete buttons
// ---------------------------------------------------------------------------

function processDuplicates(library: Track[]): CommandResult {
  if (library.length === 0) {
    return { handled: true, passToAgent: false, reply: 'Library is empty.' }
  }

  // Group by normalized title + artist
  const groups = new Map<string, Track[]>()
  for (const t of library) {
    const key = `${(t.artist || '').toLowerCase().trim()}|||${(t.title || '').toLowerCase().trim()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  // Also check by filename
  const fileGroups = new Map<string, Track[]>()
  for (const t of library) {
    if (!t.file) continue
    const key = t.file.toLowerCase().trim()
    if (!fileGroups.has(key)) fileGroups.set(key, [])
    fileGroups.get(key)!.push(t)
  }

  // Collect duplicates (keep first, mark rest for deletion)
  const dupes: { keep: Track; remove: Track[] }[] = []
  const seen = new Set<string>()

  for (const [key, tracks] of groups) {
    if (tracks.length > 1 && !seen.has(key)) {
      seen.add(key)
      dupes.push({ keep: tracks[0], remove: tracks.slice(1) })
    }
  }

  for (const [, tracks] of fileGroups) {
    if (tracks.length > 1) {
      const key = `${(tracks[0].artist || '').toLowerCase()}|||${(tracks[0].title || '').toLowerCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        dupes.push({ keep: tracks[0], remove: tracks.slice(1) })
      }
    }
  }

  if (dupes.length === 0) {
    return { handled: true, passToAgent: false, reply: '**No duplicates found.** Your library is clean.' }
  }

  const totalRemovable = dupes.reduce((sum, d) => sum + d.remove.length, 0)

  const lines = dupes.map((d, i) => {
    const removeLines = d.remove.map(r =>
      `   ✗ ${r.file || r.title} [DELETE:${r.id}]`
    ).join('\n')
    return `**${i + 1}. ${d.keep.artist ? d.keep.artist + ' — ' : ''}${d.keep.title}** (${d.remove.length + 1} copies)\n   ✓ Keep: ${d.keep.file || d.keep.title}\n${removeLines}`
  })

  return {
    handled: true,
    passToAgent: false,
    reply: `**Found ${dupes.length} duplicates (${totalRemovable} files to remove):**\n\n${lines.join('\n\n')}`,
  }
}

// ---------------------------------------------------------------------------
// Health Check — scan video files for corruption
// ---------------------------------------------------------------------------

async function processHealthCheck(
  library: Track[],
  onProgress?: (message: string) => void,
): Promise<CommandResult> {
  if (library.length === 0) {
    return { handled: true, passToAgent: false, reply: 'Library is empty. Upload some tracks first.' }
  }

  onProgress?.(`Scanning ${library.length} files for issues...`)

  const badFiles: { id: string; title: string; artist: string; reason: string }[] = []
  const BATCH = 5
  let scanned = 0

  for (let i = 0; i < library.length; i += BATCH) {
    const batch = library.slice(i, i + BATCH)

    const checks = batch.map(track => new Promise<void>((resolve) => {
      // Detect manually marked bad files (title starts with /)
      if (track.title.startsWith('/') || (track.artist && track.artist.startsWith('/'))) {
        badFiles.push({ id: track.id, title: track.title, artist: track.artist || '', reason: 'Marked as bad — title starts with /' })
        resolve()
        return
      }

      // No videoUrl = no blob stored
      if (!track.videoUrl) {
        badFiles.push({ id: track.id, title: track.title, artist: track.artist || '', reason: 'No video file (missing blob)' })
        resolve()
        return
      }

      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      let settled = false

      const cleanup = () => {
        if (settled) return
        settled = true
        video.src = ''
        video.load()
        resolve()
      }

      // Timeout — if nothing happens in 5s, it's likely broken
      const timer = setTimeout(() => {
        if (!settled) {
          badFiles.push({ id: track.id, title: track.title, artist: track.artist || '', reason: 'Timeout — file may be corrupt' })
          cleanup()
        }
      }, 5000)

      video.onloadedmetadata = () => {
        clearTimeout(timer)
        // Check duration
        if (!video.duration || isNaN(video.duration) || video.duration === 0) {
          badFiles.push({ id: track.id, title: track.title, artist: track.artist || '', reason: 'Zero duration — empty or corrupt file' })
        }
        // Check video dimensions (audio-only files have 0x0)
        else if (video.videoWidth === 0 || video.videoHeight === 0) {
          badFiles.push({ id: track.id, title: track.title, artist: track.artist || '', reason: 'Audio-only — no video track' })
        }
        // Check very short files (< 10 seconds usually means error)
        else if (video.duration < 10) {
          badFiles.push({ id: track.id, title: track.title, artist: track.artist || '', reason: `Too short (${Math.round(video.duration)}s) — likely incomplete` })
        }
        cleanup()
      }

      video.onerror = () => {
        clearTimeout(timer)
        badFiles.push({ id: track.id, title: track.title, artist: track.artist || '', reason: 'Cannot decode — corrupt or unsupported codec' })
        cleanup()
      }

      video.src = track.videoUrl
    }))

    await Promise.all(checks)
    scanned += batch.length
    if (scanned % 50 === 0 || scanned === library.length) {
      onProgress?.(`Scanned ${scanned}/${library.length} files... (${badFiles.length} issues found)`)
    }
  }

  const healthy = library.length - badFiles.length

  if (badFiles.length === 0) {
    return {
      handled: true,
      passToAgent: false,
      reply: `**Health Check Complete** ✓\n\nAll ${library.length} files are healthy — no issues found.`,
    }
  }

  // Build result with delete buttons and YouTube search links
  const lines = badFiles.map((f, i) => {
    const searchQuery = encodeURIComponent(`${f.artist} ${f.title} official music video`)
    return `${i + 1}. **${f.artist ? f.artist + ' — ' : ''}${f.title}**\n   ⚠ ${f.reason}\n   [Search on YouTube](https://www.youtube.com/results?search_query=${searchQuery})\n   [DELETE:${f.id}]`
  })

  const reasonMap: Record<string, string> = {}
  badFiles.forEach(f => { reasonMap[f.id] = f.reason })

  return {
    handled: true,
    passToAgent: false,
    reply: `**Health Check Complete**\n\n✓ ${healthy} healthy files\n✗ ${badFiles.length} issues found\n\n${lines.join('\n\n')}`,
    action: 'health_results',
    healthBadIds: badFiles.map(f => f.id),
    healthBadReasons: reasonMap,
  }
}

// ---------------------------------------------------------------------------
// YouTube Lookup — search for music videos
// ---------------------------------------------------------------------------

async function processYouTubeLookup(
  query: string,
  onProgress?: (message: string) => void,
): Promise<CommandResult> {
  if (!query.trim()) {
    return { handled: true, passToAgent: false, reply: 'Usage: `/lookup Artist Name` or `/lookup Artist - Song Title`' }
  }

  onProgress?.(`Searching YouTube for "${query}"...`)

  try {
    const res = await fetch(`/api/lookup?action=youtube-search&q=${encodeURIComponent(query + ' official music video')}&limit=8`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { handled: true, passToAgent: false, reply: (err as Record<string, string>).error || 'YouTube search failed. Check your API key in Settings → General.' }
    }

    const data = await res.json()
    const results = data.results || []

    if (results.length === 0) {
      return { handled: true, passToAgent: false, reply: `No YouTube results found for "${query}".` }
    }

    const decode = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n))).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    const lines = results.map((r: { title: string; channel: string; url: string }, i: number) =>
      `${i + 1}. [${decode(r.title)}](${r.url})\n    _${decode(r.channel)}_`
    )

    return {
      handled: true,
      passToAgent: false,
      reply: `**YouTube results for "${query}":**\n\n${lines.join('\n')}`,
    }
  } catch {
    return { handled: true, passToAgent: false, reply: 'YouTube search failed. Check your internet connection.' }
  }
}

// ---------------------------------------------------------------------------
// Suggest — analyze library gaps and suggest artists with YouTube links
// ---------------------------------------------------------------------------

async function processSuggest(
  command: string,
  library: Track[],
  onProgress?: (message: string) => void,
): Promise<CommandResult> {
  if (library.length === 0) {
    return { handled: true, passToAgent: false, reply: 'Library is empty. Upload some tracks first.' }
  }

  const args = command.replace(/^\/suggest\s*/i, '').trim().toLowerCase()

  // Analyze library
  const genreMap = new Map<string, number>()
  const artistMap = new Map<string, number>()
  const decadeMap = new Map<string, number>()
  const langMap = new Map<string, number>()

  for (const t of library) {
    if (t.genre) genreMap.set(t.genre, (genreMap.get(t.genre) || 0) + 1)
    if (t.artist) artistMap.set(t.artist, (artistMap.get(t.artist) || 0) + 1)
    if (t.language) langMap.set(t.language.toUpperCase(), (langMap.get(t.language.toUpperCase()) || 0) + 1)
    if (t.released) {
      const year = parseInt(t.released)
      if (year >= 1970 && year <= 2009) {
        const decade = `${Math.floor(year / 10) * 10}s`
        decadeMap.set(decade, (decadeMap.get(decade) || 0) + 1)
      }
    }
  }

  // Determine what to suggest based on args
  let focusGenre = ''
  let focusDecade = ''
  let focusLang = ''

  // Parse decade: "90s", "1990", "1990s"
  const decadeMatch = args.match(/\b(19|20)?(\d{2})s?\b/)
  if (decadeMatch) {
    const d = decadeMatch[2]
    // Only treat as decade if it looks like one (70-09)
    const num = parseInt(d)
    if (num >= 0 && num <= 9) focusDecade = '0' + d.charAt(0) + 's' // 00s
    else if (num >= 70 && num <= 99) focusDecade = d + 's'
    else if (num >= 0 && num <= 20) focusDecade = d + 's'
  }

  // Parse language (2-letter code)
  const langMatch = args.match(/\b([a-z]{2})\b/i)
  if (langMatch && langMatch[1].toUpperCase() === langMatch[1]) focusLang = langMatch[1]
  const langPrefixMatch = args.match(/\b(?:language|lang)\s+([a-z]{2,3})\b/i)
  if (langPrefixMatch) focusLang = langPrefixMatch[1].toUpperCase()

  // Remaining words as genre — strip meta-words that aren't actual genres
  const metaWords = 'genre|decade|language|lang|suggest|from|the|my|library|missing|artists|songs'
  const genreWords = args
    .replace(/\b(19|20)?\d{2}s?\b/g, '')
    .replace(/\b(?:language|lang)\s+[a-z]{2,3}\b/gi, '')
    .replace(/\b[A-Z]{2}\b/g, '')
    .replace(new RegExp(`\\b(${metaWords})\\b`, 'gi'), '')
    .trim()
  if (genreWords.length > 2) focusGenre = genreWords

  onProgress?.('Analyzing your library...')

  // Build suggestion context for AI
  const topGenres = [...genreMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const topArtists = [...artistMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  const decades = [...decadeMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  // DJ essentials — artists commonly needed per decade/genre
  // This is a curated reference list for gap detection
  const essentials: Record<string, string[]> = {
    '70s_rock': ['Led Zeppelin', 'Pink Floyd', 'Deep Purple', 'Black Sabbath', 'Queen', 'The Eagles', 'Fleetwood Mac', 'AC/DC', 'Aerosmith', 'Kiss'],
    '70s_disco': ['Bee Gees', 'Donna Summer', 'Gloria Gaynor', 'ABBA', 'KC and the Sunshine Band', 'Chic', 'Village People', 'Barry White', 'Earth Wind and Fire'],
    '80s_pop': ['Michael Jackson', 'Madonna', 'Prince', 'Whitney Houston', 'George Michael', 'Cyndi Lauper', 'Phil Collins', 'Lionel Richie', 'Tina Turner'],
    '80s_rock': ['Bon Jovi', 'Def Leppard', 'Guns N Roses', 'Van Halen', 'Whitesnake', 'Scorpions', 'Europe', 'Ozzy Osbourne', 'Motley Crue', 'Twisted Sister'],
    '80s_newwave': ['Depeche Mode', 'Duran Duran', 'Tears for Fears', 'A-ha', 'The Cure', 'New Order', 'Pet Shop Boys', 'Erasure', 'Soft Cell', 'OMD'],
    '90s_pop': ['Backstreet Boys', 'Spice Girls', 'Britney Spears', 'NSYNC', 'TLC', 'Destiny\'s Child', 'Ace of Base', 'Aqua', 'Savage Garden'],
    '90s_rock': ['Nirvana', 'Pearl Jam', 'Red Hot Chili Peppers', 'Oasis', 'Radiohead', 'Foo Fighters', 'Green Day', 'Alanis Morissette', 'Cranberries'],
    '90s_dance': ['2 Unlimited', 'Snap!', 'Haddaway', 'La Bouche', 'Corona', 'Real McCoy', 'Culture Beat', 'Scooter', 'DJ BoBo', 'Vengaboys'],
    '90s_hiphop': ['2Pac', 'Notorious B.I.G.', 'Dr. Dre', 'Snoop Dogg', 'Eminem', 'Coolio', 'Salt-N-Pepa', 'MC Hammer', 'Vanilla Ice'],
    '00s_pop': ['Beyonce', 'Rihanna', 'Lady Gaga', 'Shakira', 'Justin Timberlake', 'Black Eyed Peas', 'Nelly Furtado', 'Christina Aguilera', 'Usher'],
    '00s_rock': ['Linkin Park', 'Evanescence', 'Nickelback', 'The Killers', 'Coldplay', 'Muse', 'System of a Down', 'Green Day', '3 Doors Down'],
    // EU 24 official languages + Turkish
    'NL': ['Marco Borsato', 'André Hazes', 'Guus Meeuwis', 'Doe Maar', 'Golden Earring', 'Volumia!', 'K3', 'Within Temptation', 'Anouk', 'Bløf'],
    'DE': ['Nena', 'Rammstein', 'Falco', 'Modern Talking', 'Scorpions', 'Kraftwerk', 'Alphaville', 'Tokio Hotel', 'Peter Fox', 'Herbert Grönemeyer'],
    'FR': ['Edith Piaf', 'Jacques Brel', 'Stromae', 'Daft Punk', 'David Guetta', 'Indila', 'Zaz', 'Joe Dassin', 'Charles Aznavour', 'MC Solaar'],
    'ES': ['Enrique Iglesias', 'Shakira', 'Ricky Martin', 'Julio Iglesias', 'Gloria Estefan', 'Daddy Yankee', 'Maná', 'Alejandro Sanz', 'Rosalía', 'Bad Bunny'],
    'IT': ['Eros Ramazzotti', 'Laura Pausini', 'Andrea Bocelli', 'Zucchero', 'Toto Cutugno', 'Ricchi e Poveri', 'Al Bano', 'Måneskin', 'Raffaella Carrà'],
    'PT': ['Amália Rodrigues', 'Mariza', 'Madredeus', 'Ana Moura', 'Dulce Pontes', 'Nelly Furtado', 'Salvador Sobral', 'Buraka Som Sistema'],
    'EL': ['Demis Roussos', 'Nana Mouskouri', 'Marinella', 'Despina Vandi', 'Sakis Rouvas', 'Helena Paparizou', 'Yanni', 'Konstantinos Argiros'],
    'PL': ['Edyta Górniak', 'Basia', 'Kayah', 'Doda', 'Sarsa', 'Dawid Podsiadło', 'Brodka', 'Ich Troje', 'Behemoth'],
    'RO': ['O-Zone', 'Inna', 'Alexandra Stan', 'Edward Maya', 'Akcent', 'Morandi', 'Antonia', 'Dan Balan'],
    'SV': ['ABBA', 'Roxette', 'Ace of Base', 'Robyn', 'Swedish House Mafia', 'Avicii', 'Zara Larsson', 'Loreen', 'Europe'],
    'DA': ['Aqua', 'Lukas Graham', 'MO', 'Volbeat', 'Whigfield', 'Medina', 'Nephew', 'Outlandish'],
    'FI': ['Lordi', 'Nightwish', 'HIM', 'The Rasmus', 'Sunrise Avenue', 'Apocalyptica', 'Bomfunk MC\'s', 'Darude'],
    'HU': ['Omega', 'Cserháti Zsuzsa', 'Charlie', 'ByeAlex', 'Tankcsapda', 'Republic', 'Magna Cum Laude'],
    'CS': ['Karel Gott', 'Helena Vondráčková', 'Lucie Bílá', 'Kabát', 'Chinaski', 'Marta Kubišová'],
    'SK': ['Elán', 'Tublatanka', 'Richard Müller', 'Peter Nagy', 'Kristína', 'No Name'],
    'BG': ['Azis', 'Papi Hans', 'Grafa', 'Mira', 'Krisko', 'Galena', 'Preslava'],
    'HR': ['Severina', 'Thompson', 'Oliver Dragojević', 'Gibonni', 'Jelena Rozga', 'Magazin', '2Cellos'],
    'SL': ['Laibach', 'Siddharta', 'Magnifico', 'Nik Nowhere', 'Zmelkoow'],
    'LT': ['Jurga', 'Donatas Montvydas', 'The Roop', 'Marijonas Mikutavičius', 'Jazzu'],
    'LV': ['Brainstorm', 'Prāta Vētra', 'Aminata', 'Jumprava', 'Instrumenti'],
    'ET': ['Vanilla Ninja', 'Urban Symphony', 'Kerli', 'Ott Lepland', 'Tanel Padar'],
    'MT': ['Ira Losco', 'Chiara', 'Destiny Chukunyere', 'Glen Vella'],
    'GA': ['Clannad', 'Enya', 'The Cranberries', 'U2', 'Sinéad O\'Connor', 'The Corrs', 'Hozier', 'Thin Lizzy'],
    'TR': ['Tarkan', 'Sezen Aksu', 'Hadise', 'Ajda Pekkan', 'Mustafa Sandal', 'Kenan Doğulu', 'Barış Manço', 'Sertab Erener'],
  }

  // Find gaps — artists in essentials that are NOT in user's library
  const existingArtists = new Set([...artistMap.keys()].map(a => a.toLowerCase()))

  let relevantCategories: string[] = []
  if (focusDecade && focusGenre) {
    relevantCategories = Object.keys(essentials).filter(k => k.includes(focusDecade.replace('s', '')) && k.includes(focusGenre))
  } else if (focusDecade) {
    relevantCategories = Object.keys(essentials).filter(k => k.includes(focusDecade.replace('s', '')))
  } else if (focusLang) {
    relevantCategories = Object.keys(essentials).filter(k => k === focusLang)
  } else if (focusGenre) {
    relevantCategories = Object.keys(essentials).filter(k => k.includes(focusGenre))
  } else {
    // Pick the weakest areas
    relevantCategories = Object.keys(essentials)
  }

  // Collect missing artists
  const missingArtists: { artist: string; category: string }[] = []
  for (const cat of relevantCategories) {
    for (const artist of essentials[cat] || []) {
      if (!existingArtists.has(artist.toLowerCase())) {
        missingArtists.push({ artist, category: cat })
      }
    }
  }

  // Filter out previously suggested artists
  const prevSuggested: string[] = JSON.parse(localStorage.getItem('linus_suggested_artists') || '[]')
  const prevSet = new Set(prevSuggested.map((a: string) => a.toLowerCase()))
  const fresh = missingArtists.filter(m => !prevSet.has(m.artist.toLowerCase()))

  // Shuffle and pick 5
  const pool = fresh.length >= 5 ? fresh : missingArtists // fall back if all were suggested
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const picks = pool.slice(0, 5)

  if (picks.length === 0) {
    const filter = focusDecade || focusGenre || focusLang || ''
    const tip = filter
      ? `Your library covers the essential artists for "${filter}".`
      : 'Your library covers all essential artists in the catalog.'
    return {
      handled: true,
      passToAgent: false,
      reply: `${tip}\n\nTry: \`/suggest 80s\`, \`/suggest rock\`, \`/suggest NL\`, \`/suggest 90s dance\``,
    }
  }

  // Search YouTube for each suggested artist
  onProgress?.(`Found ${missingArtists.length} missing artists. Searching YouTube for top 5...`)

  const suggestions: string[] = []
  for (let i = 0; i < picks.length; i++) {
    const { artist, category } = picks[i]
    const catLabel = category.replace('_', ' ').replace(/(\d{2})/, '$1\'')

    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' official music video')}`
    try {
      const res = await fetch(`/api/lookup?action=youtube-search&q=${encodeURIComponent(artist + ' official music video')}&limit=3`)
      if (res.ok) {
        const data = await res.json()
        const results = data.results || []
        if (results.length > 0) {
          const links = results.map((r: { title: string; url: string }, j: number) => `   ${j + 1}. [${r.title}](${r.url})`).join('\n')
          suggestions.push(`**${i + 1}. ${artist}** _(${catLabel})_\n   You have 0 tracks. Top videos:\n${links}`)
        } else {
          suggestions.push(`**${i + 1}. ${artist}** _(${catLabel})_\n   You have 0 tracks. [Search on YouTube](${searchUrl})`)
        }
      } else {
        // No API key or API error — use direct YouTube search link
        suggestions.push(`**${i + 1}. ${artist}** _(${catLabel})_\n   You have 0 tracks. [Search on YouTube](${searchUrl})`)
      }
    } catch {
      suggestions.push(`**${i + 1}. ${artist}** _(${catLabel})_\n   You have 0 tracks. [Search on YouTube](${searchUrl})`)
    }
  }

  // Library stats summary
  // Save suggested artists to memory (avoid repeats next time)
  const newSuggested = [...prevSuggested, ...picks.map(p => p.artist)].slice(-50) // keep last 50
  localStorage.setItem('linus_suggested_artists', JSON.stringify(newSuggested))

  const statsLine = `Your library: ${library.length} tracks · ${topGenres.slice(0, 3).map(([g, c]) => `${g} (${c})`).join(', ')} · Decades: ${decades.map(([d, c]) => `${d} (${c})`).join(', ')}`
  const remaining = missingArtists.length - picks.length

  return {
    handled: true,
    passToAgent: false,
    reply: `**Today's suggestions — 5 artists missing from your library:**\n\n${suggestions.join('\n\n')}\n\n---\n_${statsLine}_\n_${remaining > 0 ? `${remaining} more missing artists available. Run /suggest again for different picks.` : 'You\'re getting close to a complete collection!'}_`,
  }
}

// ---------------------------------------------------------------------------
// Metadata lookup (MusicBrainz + Discogs via API route)
// ---------------------------------------------------------------------------

async function processLookup(
  library: Track[],
  onProgress?: (message: string) => void,
): Promise<CommandResult> {
  // Find tracks with missing metadata (album, genre, or released year)
  const needsLookup = library.filter(t =>
    !t.album || !t.genre || !t.released
  )

  if (needsLookup.length === 0) {
    return { handled: true, passToAgent: false, reply: 'All tracks have album, genre, and release year.' }
  }

  onProgress?.(`Found ${needsLookup.length} tracks with missing metadata. Looking up on MusicBrainz + Discogs...`)

  // Process in batches of 10 (rate-limited API)
  const BATCH_SIZE = 10
  const allUpdates: PendingUpdate[] = []

  for (let i = 0; i < needsLookup.length; i += BATCH_SIZE) {
    const batch = needsLookup.slice(i, i + BATCH_SIZE)
    onProgress?.(`Looking up batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(needsLookup.length / BATCH_SIZE)}...`)

    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks: batch.map(t => ({ id: t.id, title: t.title, artist: t.artist })),
        }),
      })

      if (!res.ok) {
        onProgress?.(`Batch failed: ${res.statusText}`)
        continue
      }

      const data = await res.json()
      for (const result of data.results || []) {
        const track = batch.find(t => t.id === result.id)
        if (!track) continue

        const changes: Partial<Track> = {}
        // Only fill missing fields
        if (!track.album && result.changes.album) changes.album = result.changes.album
        if (!track.genre && result.changes.genre) changes.genre = result.changes.genre
        if (!track.released && result.changes.released) changes.released = String(result.changes.released)
        if (!track.artist && result.changes.artist) changes.artist = result.changes.artist

        if (Object.keys(changes).length > 0) {
          allUpdates.push({
            trackId: track.id,
            trackTitle: track.title,
            trackArtist: track.artist,
            changes,
            source: 'claude' as const,
          })
        }
      }
    } catch (e) {
      onProgress?.(`Lookup error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (allUpdates.length === 0) {
    return {
      handled: true,
      passToAgent: false,
      reply: `Searched ${needsLookup.length} tracks on MusicBrainz + Discogs but found no new metadata.`,
    }
  }

  const summary = allUpdates.slice(0, 20).map((u, i) => {
    const fields = Object.entries(u.changes).map(([k, v]) => `${k}: ${v}`).join(', ')
    return `${i + 1}. ${u.trackArtist || 'Unknown'} — ${u.trackTitle}: ${fields}`
  }).join('\n')

  const more = allUpdates.length > 20 ? `\n... and ${allUpdates.length - 20} more` : ''

  return {
    handled: true,
    passToAgent: false,
    reply: `Found metadata for ${allUpdates.length}/${needsLookup.length} tracks:\n${summary}${more}\n\nType "apply" to save, or "cancel" to discard.`,
    pendingUpdates: allUpdates,
  }
}

// ---------------------------------------------------------------------------
// Main command processor
// ---------------------------------------------------------------------------

export async function processCommand(
  command: string,
  library: Track[],
  deckA: DeckState,
  deckB: DeckState,
  crossfader: number,
  onProgress?: (message: string) => void,
): Promise<CommandResult> {
  const cmd = command.trim().toLowerCase().split(/\s+/)[0]

  switch (cmd) {
    // Client-only: audio analysis (legacy and new unified /fix)
    case '/fix-bpm':
    case '/fix-keys':
    case '/fix-all':
    case '/fix-titles':
    case '/fix-albums':
    case '/fix-genres':
    case '/fix-language':
    case '/fix-released':
    case '/fix': {
      const fixArgs = command.replace(/^\/(fix-?\w*)\s*/i, '').trim().toLowerCase()
      const fixOptions = new Set(fixArgs.split(/\s+/).filter(w => w.length > 1))

      // If user typed only client-side options (bpm/keys only), handle locally
      if ((cmd === '/fix-bpm' || (fixOptions.size === 1 && fixOptions.has('bpm'))) && !fixOptions.has('all')) {
        return processFixBpm(library, onProgress)
      }
      if ((cmd === '/fix-keys' || (fixOptions.size === 1 && (fixOptions.has('keys') || fixOptions.has('key')))) && !fixOptions.has('all')) {
        return processFixKeys(library, onProgress)
      }

      // Pass through to API with normalized command
      // Convert "/fix genres language" → tells the batching system what to fix
      return { handled: false, passToAgent: true }
    }

    // Client-only: mixing
    case '/next':
      return processNext(library, deckA, deckB, crossfader)
    case '/key-match':
      return processKeyMatch(library, deckA, deckB, crossfader)
    case '/bpm-match':
      return processBpmMatch(library, deckA, deckB, crossfader)

    // Client-only: playback control
    case '/autoplay':
      return { handled: true, passToAgent: false, reply: 'Autoplay started.', action: 'autoplay_start' }
    case '/automix': {
      const automixArgs = command.replace(/^\/automix\s*/i, '').trim()
      if (automixArgs) {
        // Has options — build a filtered playlist first, then automix it
        const plResult = processPlaylist(command.replace('/automix', '/playlist'), library)
        if (plResult.nextTracks && plResult.nextTracks.length > 0) {
          return {
            ...plResult,
            action: 'automix_playlist',
            reply: plResult.reply?.replace('Autoplay started.', 'Automix started — Linus is DJing with this set.') || 'Automix started.',
          }
        }
      }
      return { handled: true, passToAgent: false, reply: 'Automix started — Linus is DJing.', action: 'automix_start' }
    }
    case '/stop':
      return { handled: true, passToAgent: false, reply: 'Stopped.', action: 'autoplay_stop' }

    // Client-only: help
    case '/help':
      return { handled: true, passToAgent: false, reply: 'Opening command reference...', action: 'open_help' }

    // Client-only: smart playlist — one command, stackable options
    // /playlist rock 80s 2hr | /playlist NL | /playlist 120-140 build
    case '/playlist':
    case '/stream':
      return processPlaylist(command, library)

    // Client-only: metadata lookup (legacy)
    case '/metadata-lookup':
      return processLookup(library, onProgress)

    // Health check — scan all files for corruption
    case '/health':
      return processHealthCheck(library, onProgress)

    // YouTube search for music videos
    case '/lookup':
      return processYouTubeLookup(command.replace(/^\/lookup\s*/i, '').trim(), onProgress)

    // Suggest missing artists/songs with YouTube links
    case '/suggest':
      return processSuggest(command, library, onProgress)

    // Client-only: recording
    case '/record':
      return { handled: true, passToAgent: false, reply: 'Recording started.', action: 'start_recording' }
    case '/stop-recording':
      return { handled: true, passToAgent: false, reply: 'Recording stopped. Downloading mix...', action: 'stop_recording' }

    // Client-only: set history
    case '/set-history':
    case '/history':
      return { handled: true, passToAgent: false, reply: 'Opening set history...', action: 'show_set_history' }

    // Pass-through to Claude API
    case '/scan':
    case '/fix-all':
    case '/fix-titles':
    case '/fix-albums':
    case '/fix-genres':
    case '/fix-language':
    case '/fix-released':
    case '/library-stats':
    case '/duplicates':
      return processDuplicates(library)

    case '/missing':
    case '/about':
      return { handled: false, passToAgent: true }

    // Not a recognized command — check if it's a legacy playlist command
    default: {
      // Legacy: /playlist-genre, /playlist-lang, /set, /stream-theme → redirect to /playlist
      if (cmd.startsWith('/playlist-') || cmd === '/set' || cmd === '/stream-theme') {
        return processPlaylist(command, library)
      }
      return { handled: false, passToAgent: true }
    }
  }
}

// ---------------------------------------------------------------------------
// Fix-all hybrid: runs after Claude returns its updates, adds BPM/key analysis
// ---------------------------------------------------------------------------

export async function processFixAllAudio(
  library: Track[],
  onProgress?: (message: string) => void,
): Promise<PendingUpdate[]> {
  const updates: PendingUpdate[] = []

  // BPM analysis for tracks missing BPM
  const needsBpm = library.filter(t => !t.bpm || t.bpm === 0)
  for (let i = 0; i < needsBpm.length; i++) {
    const track = needsBpm[i]
    onProgress?.(`Analyzing BPM... track ${i + 1}/${needsBpm.length}: ${track.artist || 'Unknown'} - ${track.title}`)
    const blob = await getTrackBlob(track.id)
    if (!blob) continue
    const file = new File([blob], track.file || 'track.mp4', { type: blob.type || 'video/mp4' })
    const bpm = await detectBPM(file)
    if (bpm > 0) {
      updates.push({ trackId: track.id, trackTitle: track.title, trackArtist: track.artist, changes: { bpm }, source: 'audio-analysis' })
    }
  }

  // Key analysis for tracks missing key
  const needsKey = library.filter(t => !t.key || t.key === '')
  for (let i = 0; i < needsKey.length; i++) {
    const track = needsKey[i]
    onProgress?.(`Analyzing key... track ${i + 1}/${needsKey.length}: ${track.artist || 'Unknown'} - ${track.title}`)
    const blob = await getTrackBlob(track.id)
    if (!blob) continue
    const file = new File([blob], track.file || 'track.mp4', { type: blob.type || 'video/mp4' })
    const key = await detectKey(file)
    if (key) {
      // Check if we already have a pending update for this track (from BPM)
      const existing = updates.find(u => u.trackId === track.id)
      if (existing) {
        existing.changes.key = key
      } else {
        updates.push({ trackId: track.id, trackTitle: track.title, trackArtist: track.artist, changes: { key }, source: 'audio-analysis' })
      }
    }
  }

  return updates
}
