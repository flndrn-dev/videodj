/**
 * Automix Engine — Real DJ-style segment mixing.
 *
 * NOT "play full songs and crossfade." This engine:
 * 1. Analyzes every track's structure (intro/verse/chorus/breakdown/outro)
 * 2. Picks interesting SEGMENTS (chunks) from different tracks
 * 3. Seeks to specific positions in each track
 * 4. Blends segments with EQ mixing (bass swap, long overlaps)
 * 5. Creates one continuous mix from pieces of many songs
 *
 * Like a real DJ at a club — songs don't play start to finish.
 */

import type { Track } from '@/app/hooks/usePlayerStore'
import type { DeckPanelHandle } from '@/components/deck/DeckPanel'
import type { BeatGrid, TrackSection } from '@/app/lib/beatGrid'
import { pickNextTrack, type AutomixState } from '@/app/lib/automix'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrackAnalysis {
  trackId: string
  beatGrid: BeatGrid | null
  sections: TrackSection[]
  mixInPoint: number
  mixOutPoint: number
}

/** A segment = a chunk of a specific track to play */
export interface MixSegment {
  track: Track
  startTime: number    // seconds — where to seek in the track
  endTime: number      // seconds — when to stop/transition
  duration: number     // endTime - startTime
  sectionType: string  // what part of the song this is (chorus, verse, etc.)
  energy: number       // 0-1
}

/** The mix plan = sequence of segments across both decks */
export interface MixPlan {
  segments: MixSegment[]
  overlapDuration: number  // seconds of overlap between segments
}

// ---------------------------------------------------------------------------
// Segment picker — selects interesting chunks from tracks
// ---------------------------------------------------------------------------

/**
 * Pick the best segments from a track based on its analysis.
 * Returns multiple segments (chorus, verse, etc.) ranked by interest.
 */
function getTrackSegments(track: Track, analysis: TrackAnalysis): MixSegment[] {
  const segments: MixSegment[] = []

  if (analysis.sections.length === 0) {
    // No section data — use the middle 30-60s of the track as one segment
    const dur = track.duration || 180
    const start = Math.max(0, dur * 0.2)
    const end = Math.min(dur, dur * 0.7)
    segments.push({
      track,
      startTime: start,
      endTime: end,
      duration: end - start,
      sectionType: 'unknown',
      energy: 0.5,
    })
    return segments
  }

  // Prioritize sections by DJ interest: chorus > drop > verse > buildup > breakdown > intro > outro
  const priority: Record<string, number> = {
    chorus: 10, drop: 9, verse: 6, buildup: 5, breakdown: 4, intro: 2, outro: 1,
  }

  for (const section of analysis.sections) {
    const dur = section.endTime - section.startTime
    // Skip very short sections (<10s) and very long ones (>90s, trim them)
    if (dur < 10) continue

    segments.push({
      track,
      startTime: section.startTime,
      endTime: dur > 90 ? section.startTime + 90 : section.endTime,
      duration: Math.min(dur, 90),
      sectionType: section.type,
      energy: section.energy,
    })
  }

  // Sort by priority (best sections first)
  segments.sort((a, b) => (priority[b.sectionType] || 0) - (priority[a.sectionType] || 0))

  return segments
}

/**
 * Pick the best next segment considering flow from the current segment.
 * Matches energy, avoids repeating the same track, considers BPM/key.
 */
function pickNextSegment(
  currentSegment: MixSegment,
  library: Track[],
  analyses: Map<string, TrackAnalysis>,
  state: AutomixState,
  usedSegments: Set<string>,  // "trackId:startTime" keys
): MixSegment | null {
  const candidates: { segment: MixSegment; score: number }[] = []

  for (const track of library) {
    // Don't pick from the same track that's currently playing
    if (track.id === currentSegment.track.id) continue
    // Don't pick recently played tracks (last 3)
    const recentPlayed = Array.from(state.playedIds).slice(-3)
    if (recentPlayed.includes(track.id)) continue

    const analysis = analyses.get(track.id)
    if (!analysis) continue

    const segments = getTrackSegments(track, analysis)

    for (const seg of segments) {
      const segKey = `${track.id}:${Math.round(seg.startTime)}`
      if (usedSegments.has(segKey)) continue

      let score = 0

      // Energy flow: prefer segments that follow naturally
      const energyDiff = Math.abs(seg.energy - currentSegment.energy)
      score += Math.max(0, 10 - energyDiff * 15)

      // BPM compatibility
      if (track.bpm > 0 && currentSegment.track.bpm > 0) {
        const bpmDiff = Math.abs(track.bpm - currentSegment.track.bpm)
        if (bpmDiff <= 5) score += 15
        else if (bpmDiff <= 10) score += 10
        else if (bpmDiff <= 20) score += 5
      }

      // Section type flow — what transitions well
      const goodFlows: Record<string, string[]> = {
        chorus: ['verse', 'breakdown', 'chorus'],
        verse: ['chorus', 'buildup', 'drop'],
        breakdown: ['buildup', 'chorus', 'drop'],
        buildup: ['drop', 'chorus'],
        drop: ['verse', 'breakdown', 'chorus'],
        intro: ['verse', 'chorus'],
        outro: ['intro', 'verse'],
      }
      const goodNext = goodFlows[currentSegment.sectionType] || []
      if (goodNext.includes(seg.sectionType)) score += 8

      // Prefer chorus and drop (most interesting to listeners)
      if (seg.sectionType === 'chorus') score += 5
      if (seg.sectionType === 'drop') score += 5

      candidates.push({ segment: seg, score })
    }
  }

  if (candidates.length === 0) return null

  // Sort by score, pick from top 3 with randomness
  candidates.sort((a, b) => b.score - a.score)
  const top = candidates.slice(0, Math.min(3, candidates.length))
  const weights = [0.6, 0.25, 0.15]
  const rand = Math.random()
  let cumulative = 0
  for (let i = 0; i < top.length; i++) {
    cumulative += weights[i] || 0.1
    if (rand <= cumulative) return top[i].segment
  }
  return top[0].segment
}

// ---------------------------------------------------------------------------
// Automix Controller
// ---------------------------------------------------------------------------

export class AutomixController {
  private active = false
  private library: Track[] = []
  private state: AutomixState | null = null
  private analyses = new Map<string, TrackAnalysis>()

  // Current mix state
  private currentSegment: MixSegment | null = null
  private nextSegment: MixSegment | null = null
  private usedSegments = new Set<string>()
  private transitioning = false
  private transitionTimers: ReturnType<typeof setTimeout>[] = []

  // Deck refs + callbacks
  private deckARef: React.RefObject<DeckPanelHandle | null> | null = null
  private deckBRef: React.RefObject<DeckPanelHandle | null> | null = null
  private activeDeck: 'A' | 'B' = 'A'
  private onLoadTrack: ((deck: 'A' | 'B', track: Track) => void) | null = null
  private onPlay: ((deck: 'A' | 'B') => void) | null = null
  private onPause: ((deck: 'A' | 'B') => void) | null = null
  private onEject: ((deck: 'A' | 'B') => void) | null = null
  private onSetCrossfader: ((value: number) => void) | null = null
  private onQueueUpdate: ((queue: Track[]) => void) | null = null
  private onAnalyzeTrack: ((track: Track) => void) | null = null

  init(config: {
    deckARef: React.RefObject<DeckPanelHandle | null>
    deckBRef: React.RefObject<DeckPanelHandle | null>
    onLoadTrack: (deck: 'A' | 'B', track: Track) => void
    onPlay: (deck: 'A' | 'B') => void
    onPause: (deck: 'A' | 'B') => void
    onEject: (deck: 'A' | 'B') => void
    onSetCrossfader: (value: number) => void
    onQueueUpdate: (queue: Track[]) => void
    onAnalyzeTrack?: (track: Track) => void
  }) {
    this.deckARef = config.deckARef
    this.deckBRef = config.deckBRef
    this.onLoadTrack = config.onLoadTrack
    this.onPlay = config.onPlay
    this.onPause = config.onPause
    this.onEject = config.onEject
    this.onSetCrossfader = config.onSetCrossfader
    this.onQueueUpdate = config.onQueueUpdate
    this.onAnalyzeTrack = config.onAnalyzeTrack || null
  }

  setAnalysis(trackId: string, analysis: TrackAnalysis) {
    this.analyses.set(trackId, analysis)
  }

  getAnalysis(trackId: string): TrackAnalysis | undefined {
    return this.analyses.get(trackId)
  }

  isActive(): boolean { return this.active }

  /** Get current and next segment info for UI */
  getCurrentSegment(): MixSegment | null { return this.currentSegment }
  getNextSegment(): MixSegment | null { return this.nextSegment }

  start(library: Track[], state: AutomixState) {
    this.active = true
    this.library = library
    this.state = state
    this.usedSegments.clear()
    this.transitioning = false
    this.activeDeck = 'A'
  }

  stop() {
    this.active = false
    this.transitioning = false
    this.currentSegment = null
    this.nextSegment = null
    for (const t of this.transitionTimers) clearTimeout(t)
    this.transitionTimers = []

    // Reset EQ
    for (const ref of [this.deckARef, this.deckBRef]) {
      ref?.current?.setEQ('high', 0)
      ref?.current?.setEQ('mid', 0)
      ref?.current?.setEQ('low', 0)
      ref?.current?.setPlaybackRate(1)
    }
  }

  /**
   * Start playing the first segment.
   * Called after tracks are loaded and analyzed.
   */
  playFirstSegment(track: Track) {
    const analysis = this.analyses.get(track.id)
    if (!analysis) {
      // No analysis — play from start, treat as one big segment
      this.currentSegment = {
        track, startTime: 0, endTime: track.duration || 180,
        duration: track.duration || 180, sectionType: 'unknown', energy: 0.5,
      }
    } else {
      const segments = getTrackSegments(track, analysis)
      // Start with the first high-energy segment (chorus or verse, not intro)
      const starter = segments.find(s => s.sectionType === 'verse' || s.sectionType === 'chorus') || segments[0]
      if (starter) {
        this.currentSegment = starter
      }
    }

    if (!this.currentSegment) return

    // Seek to segment start
    const vid = this.deckARef?.current?.getVideoElement()
    if (vid) vid.currentTime = this.currentSegment.startTime

    this.onPlay?.('A')
    this.onSetCrossfader?.(0)
    this.activeDeck = 'A'

    const segKey = `${track.id}:${Math.round(this.currentSegment.startTime)}`
    this.usedSegments.add(segKey)
    this.state?.playedIds.add(track.id)

    // Pre-plan the next segment
    this.planNext()
  }

  /** Plan what segment to play next and pre-load it */
  private planNext() {
    if (!this.currentSegment || !this.state) return

    this.nextSegment = pickNextSegment(
      this.currentSegment, this.library, this.analyses, this.state, this.usedSegments,
    )

    if (!this.nextSegment) {
      // Exhausted good options — pick any track
      const fallback = pickNextTrack(this.library, this.currentSegment.track, this.state)
      if (fallback) {
        const analysis = this.analyses.get(fallback.id)
        const segments = analysis ? getTrackSegments(fallback, analysis) : []
        this.nextSegment = segments[0] || {
          track: fallback, startTime: 0, endTime: fallback.duration || 180,
          duration: fallback.duration || 180, sectionType: 'unknown', energy: 0.5,
        }
      }
    }

    if (!this.nextSegment) return

    // Load next track into the waiting deck and seek to segment start
    const waitingDeck = this.activeDeck === 'A' ? 'B' : 'A'
    this.onLoadTrack?.(waitingDeck, this.nextSegment.track)

    // Seek after a short delay (let the video load)
    const seg = this.nextSegment
    setTimeout(() => {
      const waitingPanel = waitingDeck === 'A' ? this.deckARef : this.deckBRef
      const vid = waitingPanel?.current?.getVideoElement()
      if (vid && vid.readyState >= 2) {
        vid.currentTime = seg.startTime
      } else if (vid) {
        vid.addEventListener('loadeddata', () => { vid.currentTime = seg.startTime }, { once: true })
      }
    }, 300)

    // Mark as used
    const segKey = `${this.nextSegment.track.id}:${Math.round(this.nextSegment.startTime)}`
    this.usedSegments.add(segKey)

    // Request analysis for the next track if not done
    this.onAnalyzeTrack?.(this.nextSegment.track)
  }

  /**
   * Called from time update handler. Checks if it's time to transition.
   * The transition starts BEFORE the current segment ends (overlap).
   */
  shouldTransition(currentTime: number): boolean {
    if (!this.active || this.transitioning || !this.currentSegment) return false

    // Calculate overlap duration based on BPM
    const bpm = this.currentSegment.track.bpm || 120
    const beatInterval = 60 / bpm
    const overlapBeats = bpm < 100 ? 16 : 32
    const overlapDuration = overlapBeats * beatInterval

    // Trigger when we're overlapDuration seconds before the segment end
    const triggerTime = this.currentSegment.endTime - overlapDuration
    return currentTime >= triggerTime && currentTime < this.currentSegment.endTime
  }

  /**
   * Execute the DJ transition: blend current segment into next segment.
   */
  executeTransition() {
    if (this.transitioning || !this.currentSegment || !this.nextSegment || !this.state) return
    this.transitioning = true

    const fromDeck = this.activeDeck
    const toDeck = fromDeck === 'A' ? 'B' : 'A'
    const fromPanel = fromDeck === 'A' ? this.deckARef : this.deckBRef
    const toPanel = toDeck === 'A' ? this.deckARef : this.deckBRef

    const outBpm = this.currentSegment.track.bpm || 120
    const inBpm = this.nextSegment.track.bpm || 120

    // Beatmatch
    const beatmatchRate = outBpm > 0 && inBpm > 0
      ? Math.max(0.92, Math.min(1.08, outBpm / inBpm))
      : 1
    if (beatmatchRate !== 1) toPanel?.current?.setPlaybackRate(beatmatchRate)

    // Kill incoming bass, reduce mids
    toPanel?.current?.setEQ('low', -40)
    toPanel?.current?.setEQ('mid', -6)

    // Start the incoming deck
    this.onPlay?.(toDeck)

    // --- Animated transition over overlap duration ---
    const beatInterval = 60 / outBpm
    const overlapBeats = outBpm < 100 ? 16 : 32
    const overlapDuration = overlapBeats * beatInterval
    const steps = 20
    const stepMs = (overlapDuration * 1000) / steps

    const startCf = fromDeck === 'A' ? 0 : 100
    const endCf = fromDeck === 'A' ? 100 : 0

    for (let i = 0; i <= steps; i++) {
      const timer = setTimeout(() => {
        const progress = i / steps
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2

        // Crossfader
        this.onSetCrossfader?.(Math.round(startCf + (endCf - startCf) * eased))

        // EQ automation — bass swap
        if (progress < 0.4) {
          const midGain = -6 + (progress / 0.4) * 6
          toPanel?.current?.setEQ('mid', midGain)
        } else if (progress < 0.6) {
          toPanel?.current?.setEQ('mid', 0)
          const bp = (progress - 0.4) / 0.2
          fromPanel?.current?.setEQ('low', -40 * bp)
          toPanel?.current?.setEQ('low', -40 + 40 * bp)
        } else {
          toPanel?.current?.setEQ('low', 0)
          toPanel?.current?.setEQ('mid', 0)
          fromPanel?.current?.setEQ('low', -40)
          fromPanel?.current?.setEQ('high', ((progress - 0.6) / 0.4) * -20)
        }
      }, i * stepMs)
      this.transitionTimers.push(timer)
    }

    // Cleanup after transition
    const cleanup = setTimeout(() => {
      // Reset EQ
      fromPanel?.current?.setEQ('high', 0)
      fromPanel?.current?.setEQ('mid', 0)
      fromPanel?.current?.setEQ('low', 0)
      toPanel?.current?.setEQ('high', 0)
      toPanel?.current?.setEQ('mid', 0)
      toPanel?.current?.setEQ('low', 0)
      toPanel?.current?.setPlaybackRate(1)

      // Stop and eject old deck
      this.onPause?.(fromDeck)
      this.onEject?.(fromDeck)

      // Update state
      this.currentSegment = this.nextSegment
      this.nextSegment = null
      this.activeDeck = toDeck
      this.transitioning = false
      this.transitionTimers = []

      if (this.state && this.currentSegment) {
        this.state.playedIds.add(this.currentSegment.track.id)
      }

      // Plan the next segment
      this.planNext()
    }, (overlapDuration + 0.5) * 1000)
    this.transitionTimers.push(cleanup)
  }
}

export const automixController = new AutomixController()
