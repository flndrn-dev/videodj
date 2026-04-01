/**
 * IndexedDB wrapper for persisting video library across page refreshes.
 *
 * Stores two object stores:
 * - "tracks"  — metadata (id, title, bpm, language, duration, file)
 * - "blobs"   — actual video File blobs keyed by track id
 */

import type { Track } from '@/app/hooks/usePlayerStore'

const DB_NAME = 'videodj-studio'
const DB_VERSION = 4

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('tracks')) {
        db.createObjectStore('tracks', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs')
      }
      if (!db.objectStoreNames.contains('preferences')) {
        db.createObjectStore('preferences')
      }
      if (!db.objectStoreNames.contains('linusMemory')) {
        db.createObjectStore('linusMemory', { keyPath: 'id', autoIncrement: true })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Save a track's metadata + its video blob */
export async function saveTrack(track: Track, blob: Blob): Promise<void> {
  const db = await openDB()

  // Save metadata (without videoUrl — we recreate that from the blob)
  const { videoUrl: _, ...meta } = track
  const txMeta = db.transaction('tracks', 'readwrite')
  txMeta.objectStore('tracks').put(meta)
  await new Promise<void>((resolve, reject) => {
    txMeta.oncomplete = () => resolve()
    txMeta.onerror = () => reject(txMeta.error)
  })

  // Save blob
  const txBlob = db.transaction('blobs', 'readwrite')
  txBlob.objectStore('blobs').put(blob, track.id)
  await new Promise<void>((resolve, reject) => {
    txBlob.oncomplete = () => resolve()
    txBlob.onerror = () => reject(txBlob.error)
  })

  db.close()
}

/** Save multiple tracks + blobs in batch */
export async function saveTracks(items: { track: Track; blob: Blob }[]): Promise<void> {
  if (items.length === 0) return
  const db = await openDB()

  // Batch save metadata
  const txMeta = db.transaction('tracks', 'readwrite')
  const trackStore = txMeta.objectStore('tracks')
  for (const { track } of items) {
    const { videoUrl: _, ...meta } = track
    trackStore.put(meta)
  }
  await new Promise<void>((resolve, reject) => {
    txMeta.oncomplete = () => resolve()
    txMeta.onerror = () => reject(txMeta.error)
  })

  // Batch save blobs
  const txBlob = db.transaction('blobs', 'readwrite')
  const blobStore = txBlob.objectStore('blobs')
  for (const { track, blob } of items) {
    blobStore.put(blob, track.id)
  }
  await new Promise<void>((resolve, reject) => {
    txBlob.oncomplete = () => resolve()
    txBlob.onerror = () => reject(txBlob.error)
  })

  db.close()
}

/** Load all tracks from DB, recreating videoUrl from stored blobs */
export async function loadAllTracks(): Promise<Track[]> {
  const db = await openDB()

  // Get all metadata
  const txMeta = db.transaction('tracks', 'readonly')
  const metas: Track[] = await new Promise((resolve, reject) => {
    const req = txMeta.objectStore('tracks').getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  if (metas.length === 0) {
    db.close()
    return []
  }

  // Get all blobs and create object URLs
  const txBlob = db.transaction('blobs', 'readonly')
  const blobStore = txBlob.objectStore('blobs')

  const tracks: Track[] = []
  for (const meta of metas) {
    const blob: Blob | undefined = await new Promise((resolve, reject) => {
      const req = blobStore.get(meta.id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const defaults: Partial<Track> = { artist: '', album: '', remixer: '', genre: '', key: '', released: '', thumbnail: '', timesPlayed: 0 }
    tracks.push({
      ...defaults,
      ...meta,
      videoUrl: blob ? URL.createObjectURL(blob) : undefined,
    })
  }

  db.close()
  return tracks
}

/** Clear the entire library from DB */
export async function clearLibrary(): Promise<void> {
  const db = await openDB()

  const txMeta = db.transaction('tracks', 'readwrite')
  txMeta.objectStore('tracks').clear()
  await new Promise<void>((resolve, reject) => {
    txMeta.oncomplete = () => resolve()
    txMeta.onerror = () => reject(txMeta.error)
  })

  const txBlob = db.transaction('blobs', 'readwrite')
  txBlob.objectStore('blobs').clear()
  await new Promise<void>((resolve, reject) => {
    txBlob.oncomplete = () => resolve()
    txBlob.onerror = () => reject(txBlob.error)
  })

  db.close()
}

/** Update a track's metadata in the DB (does not touch the blob) */
export async function updateTrackMeta(id: string, updates: Partial<Track>): Promise<void> {
  const db = await openDB()

  // Read existing
  const txRead = db.transaction('tracks', 'readonly')
  const existing: Track | undefined = await new Promise((resolve, reject) => {
    const req = txRead.objectStore('tracks').get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  if (!existing) { db.close(); return }

  // Merge and write back
  const { videoUrl: _, ...clean } = { ...existing, ...updates }
  const txWrite = db.transaction('tracks', 'readwrite')
  txWrite.objectStore('tracks').put(clean)
  await new Promise<void>((resolve, reject) => {
    txWrite.oncomplete = () => resolve()
    txWrite.onerror = () => reject(txWrite.error)
  })

  db.close()
}

/** Retrieve a single audio/video blob by track ID */
export async function getTrackBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDB()
    const tx = db.transaction('blobs', 'readonly')
    const blob: Blob | undefined = await new Promise((resolve, reject) => {
      const req = tx.objectStore('blobs').get(id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return blob || null
  } catch {
    return null
  }
}

/** Batch update multiple tracks' metadata in a single transaction */
export async function batchUpdateTrackMeta(updates: { id: string; changes: Partial<Track> }[]): Promise<void> {
  if (updates.length === 0) return
  const db = await openDB()

  // Read all existing tracks
  const txRead = db.transaction('tracks', 'readonly')
  const store = txRead.objectStore('tracks')
  const existing = new Map<string, Track>()
  for (const { id } of updates) {
    const track: Track | undefined = await new Promise((resolve, reject) => {
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (track) existing.set(id, track)
  }

  // Write all updates in one transaction
  const txWrite = db.transaction('tracks', 'readwrite')
  const writeStore = txWrite.objectStore('tracks')
  for (const { id, changes } of updates) {
    const track = existing.get(id)
    if (!track) continue
    const { videoUrl: _, ...clean } = { ...track, ...changes }
    writeStore.put(clean)
  }
  await new Promise<void>((resolve, reject) => {
    txWrite.oncomplete = () => resolve()
    txWrite.onerror = () => reject(txWrite.error)
  })

  db.close()
}

/** Delete a track and its blob from the DB */
export async function deleteTrackFromDB(id: string): Promise<void> {
  const db = await openDB()

  const txMeta = db.transaction('tracks', 'readwrite')
  txMeta.objectStore('tracks').delete(id)
  await new Promise<void>((resolve, reject) => {
    txMeta.oncomplete = () => resolve()
    txMeta.onerror = () => reject(txMeta.error)
  })

  const txBlob = db.transaction('blobs', 'readwrite')
  txBlob.objectStore('blobs').delete(id)
  await new Promise<void>((resolve, reject) => {
    txBlob.oncomplete = () => resolve()
    txBlob.onerror = () => reject(txBlob.error)
  })

  db.close()
}

/** Get the total number of tracks stored */
export async function getTrackCount(): Promise<number> {
  const db = await openDB()
  const tx = db.transaction('tracks', 'readonly')
  const count: number = await new Promise((resolve, reject) => {
    const req = tx.objectStore('tracks').count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return count
}

// ---------------------------------------------------------------------------
// User preferences (name, genres, language prefs, etc.)
// ---------------------------------------------------------------------------

export interface UserPreferences {
  userName: string
  favoriteGenres: string[]
  favoriteLanguages: string[]
  bpmRange: { min: number; max: number }
  notes: string
  setupComplete: boolean
}

const DEFAULT_PREFS: UserPreferences = {
  userName: '',
  favoriteGenres: [],
  favoriteLanguages: [],
  bpmRange: { min: 0, max: 0 },
  notes: '',
  setupComplete: false,
}

export async function savePreferences(prefs: Partial<UserPreferences>): Promise<void> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains('preferences')) { db.close(); return }
    const existing = await loadPreferences()
    const merged = { ...existing, ...prefs }
    const tx = db.transaction('preferences', 'readwrite')
    tx.objectStore('preferences').put(merged, 'user')
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch { /* preferences store not available yet */ }
}

export async function loadPreferences(): Promise<UserPreferences> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains('preferences')) { db.close(); return DEFAULT_PREFS }
    const tx = db.transaction('preferences', 'readonly')
    const prefs: UserPreferences | undefined = await new Promise((resolve, reject) => {
      const req = tx.objectStore('preferences').get('user')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return prefs ? { ...DEFAULT_PREFS, ...prefs } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

// ---------------------------------------------------------------------------
// Deck state persistence (which tracks are loaded in each deck)
// ---------------------------------------------------------------------------

export interface DeckPersist {
  deckATrackId: string | null
  deckBTrackId: string | null
  deckATime: number
  deckBTime: number
  deckAPlaying: boolean
  deckBPlaying: boolean
  crossfader: number
}

export async function saveDeckState(state: DeckPersist): Promise<void> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains('preferences')) { db.close(); return }
    const tx = db.transaction('preferences', 'readwrite')
    tx.objectStore('preferences').put(state, 'deckState')
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch { /* ignore */ }
}

export async function loadDeckState(): Promise<DeckPersist | null> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains('preferences')) { db.close(); return null }
    const tx = db.transaction('preferences', 'readonly')
    const state: DeckPersist | undefined = await new Promise((resolve, reject) => {
      const req = tx.objectStore('preferences').get('deckState')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return state || null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Chat message persistence
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'agent'
  text: string
}

export async function saveChatMessages(messages: ChatMessage[]): Promise<void> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains('preferences')) { db.close(); return }
    const tx = db.transaction('preferences', 'readwrite')
    tx.objectStore('preferences').put(messages, 'chatMessages')
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch { /* ignore */ }
}

export async function loadChatMessages(): Promise<ChatMessage[]> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains('preferences')) { db.close(); return [] }
    const tx = db.transaction('preferences', 'readonly')
    const msgs: ChatMessage[] | undefined = await new Promise((resolve, reject) => {
      const req = tx.objectStore('preferences').get('chatMessages')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return msgs || []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Linus Memory — persistent conversation summaries
// ---------------------------------------------------------------------------

export interface LinusMemoryEntry {
  id?: number
  timestamp: string
  summary: string
  topics: string[]
  actions: string[]
}

export async function saveLinusMemory(entry: Omit<LinusMemoryEntry, 'id'>): Promise<void> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains('linusMemory')) { db.close(); return }
    const tx = db.transaction('linusMemory', 'readwrite')
    tx.objectStore('linusMemory').add(entry)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch { /* ignore */ }
}

export async function loadLinusMemories(limit = 20): Promise<LinusMemoryEntry[]> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains('linusMemory')) { db.close(); return [] }
    const tx = db.transaction('linusMemory', 'readonly')
    const all: LinusMemoryEntry[] = await new Promise((resolve, reject) => {
      const req = tx.objectStore('linusMemory').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    // Return most recent entries
    return all.slice(-limit)
  } catch {
    return []
  }
}

export async function clearLinusMemories(): Promise<void> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains('linusMemory')) { db.close(); return }
    const tx = db.transaction('linusMemory', 'readwrite')
    tx.objectStore('linusMemory').clear()
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch { /* ignore */ }
}
