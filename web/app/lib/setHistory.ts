/**
 * Set History — logs every DJ set with tracklist, timestamps, and stats.
 *
 * Stored in IndexedDB. Each set has:
 * - Start/end time
 * - Tracklist with timestamps (when each track was played)
 * - Total duration
 * - Automix/manual mode
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetEntry {
  trackId: string
  title: string
  artist: string
  bpm: number
  key: string
  startTime: number    // timestamp when this track started playing
  endTime: number      // timestamp when this track stopped
  deck: 'A' | 'B'
}

export interface DJSet {
  id: string
  startedAt: number    // Date.now() when set started
  endedAt: number      // Date.now() when set ended (0 = still active)
  name: string         // user-editable set name
  tracklist: SetEntry[]
  mode: 'manual' | 'autoplay' | 'automix'
  totalDuration: number // seconds
}

// ---------------------------------------------------------------------------
// Set History Manager
// ---------------------------------------------------------------------------

class SetHistoryManager {
  private activeSet: DJSet | null = null
  private currentEntry: SetEntry | null = null
  private history: DJSet[] = []
  private dbReady = false

  /** Start a new DJ set */
  startSet(mode: 'manual' | 'autoplay' | 'automix' = 'manual'): DJSet {
    // End any active set first
    if (this.activeSet) this.endSet()

    const set: DJSet = {
      id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: Date.now(),
      endedAt: 0,
      name: `DJ Set — ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      tracklist: [],
      mode,
      totalDuration: 0,
    }

    this.activeSet = set
    this.currentEntry = null
    return set
  }

  /** Log a track being played */
  logTrack(trackId: string, title: string, artist: string, bpm: number, key: string, deck: 'A' | 'B') {
    if (!this.activeSet) this.startSet()

    // End current entry
    if (this.currentEntry) {
      this.currentEntry.endTime = Date.now()
      this.activeSet!.tracklist.push(this.currentEntry)
    }

    // Start new entry
    this.currentEntry = {
      trackId,
      title,
      artist,
      bpm,
      key,
      startTime: Date.now(),
      endTime: 0,
      deck,
    }
  }

  /** End the current DJ set */
  endSet(): DJSet | null {
    if (!this.activeSet) return null

    // Close current entry
    if (this.currentEntry) {
      this.currentEntry.endTime = Date.now()
      this.activeSet.tracklist.push(this.currentEntry)
      this.currentEntry = null
    }

    this.activeSet.endedAt = Date.now()
    this.activeSet.totalDuration = Math.round((this.activeSet.endedAt - this.activeSet.startedAt) / 1000)

    const completedSet = { ...this.activeSet }
    this.history.unshift(completedSet) // newest first
    this.saveToIndexedDB(completedSet)

    this.activeSet = null
    return completedSet
  }

  /** Get the active set */
  getActiveSet(): DJSet | null {
    return this.activeSet
  }

  /** Check if a set is active */
  isActive(): boolean {
    return this.activeSet !== null
  }

  /** Get all past sets */
  getHistory(): DJSet[] {
    return [...this.history]
  }

  /** Delete a set from history */
  deleteSet(id: string) {
    this.history = this.history.filter(s => s.id !== id)
    this.deleteFromIndexedDB(id)
  }

  /** Rename a set */
  renameSet(id: string, name: string) {
    const set = this.history.find(s => s.id === id)
    if (set) {
      set.name = name
      this.saveToIndexedDB(set)
    }
  }

  /** Export set as text tracklist */
  exportTracklist(id: string): string {
    const set = this.history.find(s => s.id === id) || this.activeSet
    if (!set) return ''

    const lines: string[] = [
      `# ${set.name}`,
      `# ${new Date(set.startedAt).toLocaleString()}`,
      `# Duration: ${formatDuration(set.totalDuration)}`,
      `# Mode: ${set.mode}`,
      `# Tracks: ${set.tracklist.length}`,
      '',
    ]

    for (let i = 0; i < set.tracklist.length; i++) {
      const entry = set.tracklist[i]
      const time = formatTimestamp(entry.startTime - set.startedAt)
      lines.push(`${String(i + 1).padStart(2, '0')}. [${time}] ${entry.artist} — ${entry.title} (${entry.bpm} BPM, ${entry.key})`)
    }

    return lines.join('\n')
  }

  // ---------------------------------------------------------------------------
  // IndexedDB persistence
  // ---------------------------------------------------------------------------

  async loadFromIndexedDB() {
    try {
      const db = await openSetDB()
      const tx = db.transaction('sets', 'readonly')
      const store = tx.objectStore('sets')
      const request = store.getAll()

      return new Promise<void>((resolve) => {
        request.onsuccess = () => {
          this.history = (request.result || []).sort((a: DJSet, b: DJSet) => b.startedAt - a.startedAt)
          this.dbReady = true
          resolve()
        }
        request.onerror = () => {
          console.warn('[SetHistory] Failed to load from IndexedDB')
          this.dbReady = true
          resolve()
        }
      })
    } catch {
      this.dbReady = true
    }
  }

  private async saveToIndexedDB(set: DJSet) {
    try {
      const db = await openSetDB()
      const tx = db.transaction('sets', 'readwrite')
      tx.objectStore('sets').put(set)
    } catch (e) {
      console.warn('[SetHistory] Failed to save:', e)
    }
  }

  private async deleteFromIndexedDB(id: string) {
    try {
      const db = await openSetDB()
      const tx = db.transaction('sets', 'readwrite')
      tx.objectStore('sets').delete(id)
    } catch (e) {
      console.warn('[SetHistory] Failed to delete:', e)
    }
  }
}

// ---------------------------------------------------------------------------
// IndexedDB helper
// ---------------------------------------------------------------------------

function openSetDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('videodj-sets', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('sets')) {
        db.createObjectStore('sets', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// Singleton
export const setHistory = new SetHistoryManager()
