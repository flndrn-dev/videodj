/**
 * Database layer for videoDJ.Studio
 *
 * Hybrid storage:
 * - Metadata: IndexedDB (local cache) + PostgreSQL (cloud, when available)
 * - Video files: In-memory File refs (session) + MinIO (cloud, when available)
 * - NO blobs stored in IndexedDB — this was the performance bottleneck
 *
 * The blobs object store is kept for backward compatibility but not used for new saves.
 */

import type { Track, UserPlaylist } from '@/app/hooks/usePlayerStore'

const DB_NAME = 'videodj-studio'
const DB_VERSION = 6

// ---------------------------------------------------------------------------
// In-memory file reference map — holds File objects for the current session
// When the user scans a folder, we keep the File refs here instead of IndexedDB
// ---------------------------------------------------------------------------

const fileRefs = new Map<string, File>()

export function setFileRef(trackId: string, file: File): void {
  fileRefs.set(trackId, file)
}

export function getFileRef(trackId: string): File | null {
  return fileRefs.get(trackId) || null
}

export function getVideoUrl(trackId: string): string | undefined {
  const file = fileRefs.get(trackId)
  return file ? URL.createObjectURL(file) : undefined
}

export function clearFileRefs(): void {
  fileRefs.clear()
}

// ---------------------------------------------------------------------------
// IndexedDB — metadata only (fast)
// ---------------------------------------------------------------------------

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
      if (!db.objectStoreNames.contains('userPlaylists')) {
        db.createObjectStore('userPlaylists', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('countdowns')) {
        db.createObjectStore('countdowns', { keyPath: 'id' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Save a track's metadata only (no blob) */
export async function saveTrack(track: Track, blob?: Blob): Promise<void> {
  const db = await openDB()

  const { videoUrl: _, ...meta } = track
  const txMeta = db.transaction('tracks', 'readwrite')
  txMeta.objectStore('tracks').put(meta)
  await new Promise<void>((resolve, reject) => {
    txMeta.oncomplete = () => resolve()
    txMeta.onerror = () => reject(txMeta.error)
  })

  // Keep file ref in memory if blob is a File
  if (blob instanceof File) {
    fileRefs.set(track.id, blob)
  }

  db.close()
}

/** Save multiple tracks — metadata only, NO blob storage (instant) */
export async function saveTracks(items: { track: Track; blob: Blob }[]): Promise<void> {
  if (items.length === 0) return

  const BATCH_SIZE = 200 // metadata-only = can do large batches

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const db = await openDB()

    const txMeta = db.transaction('tracks', 'readwrite')
    const trackStore = txMeta.objectStore('tracks')
    for (const { track } of batch) {
      const { videoUrl: _, ...meta } = track
      trackStore.put(meta)
    }
    await new Promise<void>((resolve, reject) => {
      txMeta.oncomplete = () => resolve()
      txMeta.onerror = () => reject(txMeta.error)
    })

    // Store file refs in memory (not IndexedDB)
    for (const { track, blob } of batch) {
      if (blob instanceof File) {
        fileRefs.set(track.id, blob)
      }
    }

    db.close()
  }
}

/** Load all tracks from IndexedDB, attach video URLs from in-memory file refs */
export async function loadAllTracks(): Promise<Track[]> {
  const db = await openDB()

  const txMeta = db.transaction('tracks', 'readonly')
  const metas: Track[] = await new Promise((resolve, reject) => {
    const req = txMeta.objectStore('tracks').getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  db.close()

  if (metas.length === 0) return []

  // Attach video URLs from in-memory file refs
  const defaults: Partial<Track> = { artist: '', album: '', remixer: '', genre: '', key: '', released: '', thumbnail: '', timesPlayed: 0 }
  return metas.map(meta => {
    const localUrl = getVideoUrl(meta.id)
    return {
      ...defaults,
      ...meta,
      videoUrl: localUrl || undefined,
      // minioKey passes through from IndexedDB — videoUrl resolved later by syncEngine
    }
  })
}

/** Clear the entire library */
export async function clearLibrary(): Promise<void> {
  const db = await openDB()

  const txMeta = db.transaction('tracks', 'readwrite')
  txMeta.objectStore('tracks').clear()
  await new Promise<void>((resolve, reject) => {
    txMeta.oncomplete = () => resolve()
    txMeta.onerror = () => reject(txMeta.error)
  })

  // Also clear legacy blobs store
  try {
    const txBlob = db.transaction('blobs', 'readwrite')
    txBlob.objectStore('blobs').clear()
    await new Promise<void>((resolve, reject) => {
      txBlob.oncomplete = () => resolve()
      txBlob.onerror = () => reject(txBlob.error)
    })
  } catch { /* may not exist */ }

  fileRefs.clear()
  db.close()
}

/** Update a track's metadata in the DB */
export async function updateTrackMeta(id: string, updates: Partial<Track>): Promise<void> {
  const db = await openDB()

  const txRead = db.transaction('tracks', 'readonly')
  const existing: Track | undefined = await new Promise((resolve, reject) => {
    const req = txRead.objectStore('tracks').get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  if (!existing) { db.close(); return }

  const { videoUrl: _, ...clean } = { ...existing, ...updates }
  const txWrite = db.transaction('tracks', 'readwrite')
  txWrite.objectStore('tracks').put(clean)
  await new Promise<void>((resolve, reject) => {
    txWrite.oncomplete = () => resolve()
    txWrite.onerror = () => reject(txWrite.error)
  })

  db.close()
}

/** Retrieve a video blob — first check in-memory, then legacy IndexedDB */
export async function getTrackBlob(id: string): Promise<Blob | null> {
  // Check in-memory first
  const file = fileRefs.get(id)
  if (file) return file

  // Fallback to legacy IndexedDB blobs
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

/** Batch update multiple tracks' metadata */
export async function batchUpdateTrackMeta(updates: { id: string; changes: Partial<Track> }[]): Promise<void> {
  if (updates.length === 0) return
  const db = await openDB()

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

/** Delete a track and its file ref */
export async function deleteTrackFromDB(id: string): Promise<void> {
  const db = await openDB()

  const txMeta = db.transaction('tracks', 'readwrite')
  txMeta.objectStore('tracks').delete(id)
  await new Promise<void>((resolve, reject) => {
    txMeta.oncomplete = () => resolve()
    txMeta.onerror = () => reject(txMeta.error)
  })

  // Clean up legacy blob
  try {
    const txBlob = db.transaction('blobs', 'readwrite')
    txBlob.objectStore('blobs').delete(id)
    await new Promise<void>((resolve, reject) => {
      txBlob.oncomplete = () => resolve()
      txBlob.onerror = () => reject(txBlob.error)
    })
  } catch { /* may not exist */ }

  fileRefs.delete(id)
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
// User preferences
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
// Deck state persistence
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
// Linus Memory
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

// ---------------------------------------------------------------------------
// User Playlists
// ---------------------------------------------------------------------------

export async function saveUserPlaylist(pl: UserPlaylist): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('userPlaylists', 'readwrite')
  tx.objectStore('userPlaylists').put(pl)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadUserPlaylists(): Promise<UserPlaylist[]> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains('userPlaylists')) { db.close(); return [] }
    const tx = db.transaction('userPlaylists', 'readonly')
    const store = tx.objectStore('userPlaylists')
    const req = store.getAll()
    const result = await new Promise<UserPlaylist[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
    db.close()
    return result.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export async function deleteUserPlaylistFromDB(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('userPlaylists', 'readwrite')
  tx.objectStore('userPlaylists').delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

// ---------------------------------------------------------------------------
// Countdown Videos — small files, still use IndexedDB blobs
// ---------------------------------------------------------------------------

export interface CountdownVideo {
  id: string
  name: string
  blob: Blob
  addedAt: number
}

export async function saveCountdownVideo(cd: CountdownVideo): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('countdowns', 'readwrite')
  tx.objectStore('countdowns').put(cd)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadCountdownVideos(): Promise<CountdownVideo[]> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains('countdowns')) { db.close(); return [] }
    const tx = db.transaction('countdowns', 'readonly')
    const result = await new Promise<CountdownVideo[]>((resolve, reject) => {
      const req = tx.objectStore('countdowns').getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
    db.close()
    return result.sort((a, b) => b.addedAt - a.addedAt)
  } catch {
    return []
  }
}

export async function deleteCountdownVideo(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('countdowns', 'readwrite')
  tx.objectStore('countdowns').delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
