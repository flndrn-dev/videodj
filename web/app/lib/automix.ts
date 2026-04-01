/**
 * Automix Engine — Linus lazy AI agent's DJ brain.
 *
 * Smart track selection using BPM matching, Camelot key compatibility,
 * genre coherence, energy curve management, and play history tracking.
 */

import type { Track } from '@/app/hooks/usePlayerStore'
import { getCamelotCompatible } from '@/app/lib/commandProcessor'

// ---------------------------------------------------------------------------
// Energy level mapping
// ---------------------------------------------------------------------------

/** Map a track to an energy level (0-10) based on BPM + genre */
export function getTrackEnergy(track: Track): number {
  const bpm = track.bpm || 120 // default middle energy
  const genre = (track.genre || '').toLowerCase()

  // Genre energy modifiers
  let genreBoost = 0
  if (/techno|hardstyle|drum.?n.?bass|jungle|gabber/.test(genre)) genreBoost = 2
  else if (/house|edm|trance|dance|electronic/.test(genre)) genreBoost = 1
  else if (/hip.?hop|rap|r&b|rnb/.test(genre)) genreBoost = 0
  else if (/pop|disco|funk|soul/.test(genre)) genreBoost = 0
  else if (/rock|metal|punk|grunge/.test(genre)) genreBoost = 1
  else if (/jazz|blues|classical|ambient|chill|lounge/.test(genre)) genreBoost = -2
  else if (/ballad|acoustic|folk|country/.test(genre)) genreBoost = -1
  else if (/reggae|ska|dub/.test(genre)) genreBoost = -1

  // BPM → energy (60-200 BPM → 1-10 scale)
  const bpmEnergy = Math.max(1, Math.min(10, Math.round((bpm - 60) / 15)))

  return Math.max(0, Math.min(10, bpmEnergy + genreBoost))
}

// ---------------------------------------------------------------------------
// Energy curves
// ---------------------------------------------------------------------------

export type EnergyCurve = 'build' | 'peak' | 'cooldown' | 'wave' | 'natural'

/**
 * Get target energy level for a position in the set (0-1 = start-end).
 */
export function getTargetEnergy(position: number, curve: EnergyCurve): number {
  switch (curve) {
    case 'build':    return 2 + position * 8                    // 2→10
    case 'peak':     return 7 + Math.sin(position * Math.PI) * 3 // 7→10→7
    case 'cooldown': return 10 - position * 8                   // 10→2
    case 'wave':     return 5 + Math.sin(position * Math.PI * 3) * 4 // waves
    case 'natural':  // warm-up → build → peak → cooldown
    default: {
      if (position < 0.15) return 3 + (position / 0.15) * 3      // warm-up: 3→6
      if (position < 0.6)  return 6 + ((position - 0.15) / 0.45) * 4 // build: 6→10
      if (position < 0.85) return 10                               // peak: 10
      return 10 - ((position - 0.85) / 0.15) * 6                  // cooldown: 10→4
    }
  }
}

// ---------------------------------------------------------------------------
// Smart track selection
// ---------------------------------------------------------------------------

export interface AutomixState {
  playedIds: Set<string>
  energyCurve: EnergyCurve
  setStartTime: number
  setDuration: number          // total planned duration in seconds (0 = unlimited)
  totalElapsed: number         // seconds played so far
  queue: Track[]               // upcoming planned tracks (3-5)
}

export function createAutomixState(curve: EnergyCurve = 'natural', duration = 0): AutomixState {
  return {
    playedIds: new Set(),
    energyCurve: curve,
    setStartTime: Date.now(),
    setDuration: duration,
    totalElapsed: 0,
    queue: [],
  }
}

/**
 * Score a candidate track against the current track and automix state.
 * Higher score = better match.
 */
function scoreCandidate(
  candidate: Track,
  current: Track,
  state: AutomixState,
  targetEnergy: number,
): number {
  let score = 0

  // --- BPM compatibility (max 30 points) ---
  if (current.bpm > 0 && candidate.bpm > 0) {
    const bpmDiff = Math.abs(candidate.bpm - current.bpm)
    if (bpmDiff <= 3) score += 30       // near-perfect match
    else if (bpmDiff <= 8) score += 25  // easy beatmatch range (±8%)
    else if (bpmDiff <= 15) score += 15 // acceptable range
    else if (bpmDiff <= 25) score += 5  // stretch
    // > 25 = 0 points
  } else {
    score += 10 // unknown BPM — neutral
  }

  // --- Key compatibility (max 25 points) ---
  if (current.key && candidate.key) {
    const compatible = getCamelotCompatible(current.key)
    if (candidate.key === current.key) score += 25         // same key
    else if (compatible.includes(candidate.key)) score += 20 // Camelot compatible
    // else 0
  } else {
    score += 8 // unknown key — neutral
  }

  // --- Genre coherence (max 15 points) ---
  if (current.genre && candidate.genre) {
    const cGenre = current.genre.toLowerCase()
    const tGenre = candidate.genre.toLowerCase()
    if (cGenre === tGenre) score += 15
    else if (cGenre.includes(tGenre) || tGenre.includes(cGenre)) score += 10
    // Same general family
    else if (areSameFamily(cGenre, tGenre)) score += 8
  } else {
    score += 5
  }

  // --- Energy curve fit (max 20 points) ---
  const trackEnergy = getTrackEnergy(candidate)
  const energyDiff = Math.abs(trackEnergy - targetEnergy)
  score += Math.max(0, 20 - energyDiff * 4)

  // --- Variety bonus (max 10 points) ---
  // Prefer tracks not recently played
  if (!state.playedIds.has(candidate.id)) score += 10

  return score
}

/** Check if two genres are in the same family */
function areSameFamily(a: string, b: string): boolean {
  const families: string[][] = [
    ['house', 'deep house', 'tech house', 'progressive house', 'electro house', 'future house'],
    ['techno', 'minimal', 'industrial', 'acid'],
    ['trance', 'progressive trance', 'psytrance', 'uplifting trance'],
    ['hip hop', 'hip-hop', 'rap', 'trap', 'r&b', 'rnb'],
    ['pop', 'synth-pop', 'synthpop', 'electropop', 'indie pop'],
    ['rock', 'indie rock', 'alternative', 'punk', 'grunge'],
    ['drum and bass', 'drum & bass', 'dnb', 'jungle', 'breakbeat'],
    ['disco', 'funk', 'soul', 'boogie'],
    ['reggae', 'ska', 'dub', 'dancehall'],
    ['latin', 'salsa', 'bachata', 'reggaeton'],
    ['jazz', 'blues', 'swing'],
    ['classical', 'ambient', 'chill', 'lounge', 'downtempo'],
    ['country', 'folk', 'bluegrass', 'americana'],
    ['metal', 'heavy metal', 'death metal', 'thrash'],
    ['edm', 'electronic', 'dance'],
  ]
  return families.some(fam => fam.some(g => a.includes(g)) && fam.some(g => b.includes(g)))
}

/**
 * Pick the best next track for automix.
 */
export function pickNextTrack(
  library: Track[],
  currentTrack: Track,
  state: AutomixState,
  excludeIds: string[] = [],
): Track | null {
  const exclude = new Set([...excludeIds, ...Array.from(state.playedIds).slice(-3)]) // avoid last 3 played

  const candidates = library.filter(t => !exclude.has(t.id) && t.id !== currentTrack.id)
  if (candidates.length === 0) {
    // Reset played history if we've exhausted the library
    state.playedIds.clear()
    const fallback = library.filter(t => t.id !== currentTrack.id)
    if (fallback.length === 0) return null
    return fallback[0] // just pick something
  }

  // Calculate position in the set for energy curve
  const position = state.setDuration > 0
    ? Math.min(1, state.totalElapsed / state.setDuration)
    : Math.min(1, state.totalElapsed / 7200) // default 2h curve if no duration set
  const targetEnergy = getTargetEnergy(position, state.energyCurve)

  // Score all candidates
  const scored = candidates.map(t => ({
    track: t,
    score: scoreCandidate(t, currentTrack, state, targetEnergy),
  }))

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  // Add some randomness: pick from top 3 (weighted toward #1)
  const top = scored.slice(0, Math.min(3, scored.length))
  const weights = [0.6, 0.25, 0.15]
  const rand = Math.random()
  let cumulative = 0
  for (let i = 0; i < top.length; i++) {
    cumulative += weights[i] || 0.1
    if (rand <= cumulative) return top[i].track
  }
  return top[0].track
}

/**
 * Build a queue of upcoming tracks (3-5).
 */
export function buildQueue(
  library: Track[],
  currentTrack: Track,
  state: AutomixState,
  count = 5,
): Track[] {
  const queue: Track[] = []
  let simTrack = currentTrack
  let simElapsed = state.totalElapsed
  const simState: AutomixState = {
    ...state,
    playedIds: new Set(state.playedIds),
    totalElapsed: simElapsed,
  }

  const excludeIds = [currentTrack.id]

  for (let i = 0; i < count; i++) {
    const next = pickNextTrack(library, simTrack, simState, excludeIds)
    if (!next) break
    queue.push(next)
    simState.playedIds.add(next.id)
    simElapsed += next.duration || 210 // default 3:30 if no duration
    simState.totalElapsed = simElapsed
    excludeIds.push(next.id)
    simTrack = next
  }

  return queue
}

// ---------------------------------------------------------------------------
// Transition timing
// ---------------------------------------------------------------------------

/**
 * Calculate crossfade duration based on BPM.
 * Slower songs get longer fades, faster songs get shorter.
 */
export function getTransitionDuration(bpm: number): number {
  if (bpm <= 0) return 5 // default 5s
  if (bpm < 100) return 8  // slow: 8s fade
  if (bpm < 130) return 6  // mid: 6s
  if (bpm < 150) return 5  // fast: 5s
  return 4                  // very fast: 4s
}

/**
 * Calculate how many seconds before the end of a track to start the transition.
 */
export function getTransitionStartOffset(bpm: number): number {
  return getTransitionDuration(bpm) + 2 // start transition a bit before crossfade begins
}

/**
 * Calculate playback rate to match incoming track BPM to outgoing.
 * Returns a rate between 0.9 and 1.1 (±10% max).
 */
export function calcBeatmatchRate(incomingBpm: number, outgoingBpm: number): number {
  if (incomingBpm <= 0 || outgoingBpm <= 0) return 1
  const ratio = outgoingBpm / incomingBpm
  // Clamp to ±10%
  return Math.max(0.9, Math.min(1.1, ratio))
}
