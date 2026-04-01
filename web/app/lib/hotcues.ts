/**
 * Hotcue System — mark and jump to cue points in a track.
 *
 * Each track can have up to 8 hotcues (A-H).
 * Hotcues are stored per track ID and persisted to IndexedDB.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Hotcue {
  id: string        // A-H
  time: number      // seconds
  label: string     // user label or auto-detected section
  color: string     // hex color
}

export interface TrackHotcues {
  trackId: string
  cues: Hotcue[]
}

const HOTCUE_COLORS = [
  '#ef4444', // A — red
  '#f97316', // B — orange
  '#eab308', // C — yellow
  '#22c55e', // D — green
  '#3b82f6', // E — blue
  '#8b5cf6', // F — purple
  '#ec4899', // G — pink
  '#06b6d4', // H — cyan
]

const HOTCUE_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// ---------------------------------------------------------------------------
// Hotcue Manager
// ---------------------------------------------------------------------------

export class HotcueManager {
  private cues = new Map<string, Hotcue[]>() // trackId → cues

  /** Get cues for a track */
  getCues(trackId: string): Hotcue[] {
    return this.cues.get(trackId) || []
  }

  /** Set a hotcue at the current time */
  setCue(trackId: string, slotIndex: number, time: number, label?: string): Hotcue | null {
    if (slotIndex < 0 || slotIndex >= 8) return null

    const existing = this.cues.get(trackId) || []
    const id = HOTCUE_IDS[slotIndex]

    // Remove existing cue in this slot
    const filtered = existing.filter(c => c.id !== id)

    const cue: Hotcue = {
      id,
      time,
      label: label || id,
      color: HOTCUE_COLORS[slotIndex],
    }

    filtered.push(cue)
    filtered.sort((a, b) => a.time - b.time)
    this.cues.set(trackId, filtered)

    return cue
  }

  /** Remove a hotcue */
  removeCue(trackId: string, cueId: string) {
    const existing = this.cues.get(trackId) || []
    this.cues.set(trackId, existing.filter(c => c.id !== cueId))
  }

  /** Clear all cues for a track */
  clearTrack(trackId: string) {
    this.cues.delete(trackId)
  }

  /** Get the next available slot index for a track */
  getNextSlot(trackId: string): number {
    const existing = this.cues.get(trackId) || []
    const usedIds = new Set(existing.map(c => c.id))
    for (let i = 0; i < 8; i++) {
      if (!usedIds.has(HOTCUE_IDS[i])) return i
    }
    return -1 // all slots full
  }

  /** Load cues from serialized data (e.g., from IndexedDB) */
  loadAll(data: TrackHotcues[]) {
    for (const entry of data) {
      this.cues.set(entry.trackId, entry.cues)
    }
  }

  /** Serialize all cues for persistence */
  serializeAll(): TrackHotcues[] {
    const result: TrackHotcues[] = []
    for (const [trackId, cues] of this.cues) {
      result.push({ trackId, cues })
    }
    return result
  }
}

// Singleton
export const hotcueManager = new HotcueManager()
