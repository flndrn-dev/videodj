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
  action?: 'autoplay_start' | 'autoplay_stop' | 'automix_start' | 'open_help'
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

  const summary = updates.map(u => `- ${u.trackArtist || 'Unknown'} — ${u.trackTitle}: ${u.changes.bpm} BPM`).join('\n')
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

  const summary = updates.map(u => `- ${u.trackArtist || 'Unknown'} — ${u.trackTitle}: ${u.changes.key}`).join('\n')
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

  const suggestions: string[] = []

  // Priority 1: BPM + Key match
  for (const t of fullMatches.slice(0, 5)) {
    const label = getKeyCompatLabel(current.key, t.key)
    suggestions.push(`${t.artist || 'Unknown'} — ${t.title} (${t.bpm} BPM, ${t.key}) [${label}]`)
  }

  // Fill remaining with BPM-only matches
  if (suggestions.length < 5) {
    for (const t of bpmOnlyMatches.slice(0, 5 - suggestions.length)) {
      suggestions.push(`${t.artist || 'Unknown'} — ${t.title} (${t.bpm} BPM, ${t.key || 'no key'}) [BPM match only]`)
    }
  }

  if (suggestions.length === 0) {
    return { handled: true, passToAgent: false, reply: `No compatible tracks found for "${current.title}" (${current.bpm} BPM, ${current.key}).` }
  }

  const header = `Based on "${current.title}" by ${current.artist || 'Unknown'} (${current.bpm} BPM, ${current.key}):\n`
  const list = suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')
  return { handled: true, passToAgent: false, reply: header + list }
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
  const list = matches.map(t => {
    const label = getKeyCompatLabel(current.key, t.key)
    return `- ${t.artist || 'Unknown'} — ${t.title} (${t.bpm} BPM, ${t.key}) [${label}]`
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
  const list = matches.map(t =>
    `- ${t.artist || 'Unknown'} — ${t.title} (${t.bpm} BPM, ${t.key || 'no key'}) [${t.bpm > current.bpm ? '+' : ''}${t.bpm - current.bpm} BPM]`
  ).join('\n')
  return { handled: true, passToAgent: false, reply: header + list }
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
    // Client-only: audio analysis
    case '/fix-bpm':
      return processFixBpm(library, onProgress)
    case '/fix-keys':
      return processFixKeys(library, onProgress)

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
    case '/automix':
      return { handled: true, passToAgent: false, reply: 'Automix started — Linus is DJing.', action: 'automix_start' }
    case '/stop':
      return { handled: true, passToAgent: false, reply: 'Stopped.', action: 'autoplay_stop' }

    // Client-only: help
    case '/help':
      return { handled: true, passToAgent: false, reply: 'Opening command reference...', action: 'open_help' }

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
    case '/missing':
    case '/playlist':
    case '/playlist-genre':
    case '/playlist-lang':
    case '/playlist-decade':
    case '/playlist-bpm':
    case '/playlist-duration':
    case '/playlist-energy':
    case '/set':
    case '/stream':
    case '/stream-theme':
    case '/about':
      return { handled: false, passToAgent: true }

    // Not a recognized command — pass through as natural language
    default:
      return { handled: false, passToAgent: true }
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
