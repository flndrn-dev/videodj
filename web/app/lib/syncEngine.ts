/**
 * syncEngine — background sync orchestrator for videoDJ.Studio
 *
 * Handles:
 * - Upload queue: video files -> MinIO (3 concurrent, priority for live mode)
 * - Metadata sync: track data -> PostgreSQL (batched, write-through)
 * - Conversation sync: Linus summaries -> PostgreSQL
 * - Reconcile: pull cloud state -> merge into IndexedDB on load
 */

import type { Track } from '@/app/hooks/usePlayerStore'
import { uploadToCloud, getStreamUrl } from '@/app/lib/cloudStorage'
import { updateTrackMeta as updateLocalTrackMeta } from '@/app/lib/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SyncMode = 'setup' | 'active' | 'live'

interface UploadJob {
  trackId: string
  file: File
  userId: string
  priority: boolean
  retries: number
}

interface SyncStatus {
  uploading: { current: number; total: number; failed: number }
  syncing: boolean
  online: boolean
  mode: SyncMode
}

type StatusListener = (status: SyncStatus) => void

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mode: SyncMode = 'setup'
let userId: string | null = null

const uploadQueue: UploadJob[] = []
let activeUploads = 0
const MAX_RETRIES = 3
const listeners: Set<StatusListener> = new Set()
let totalEnqueued = 0
let totalFailed = 0

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function getStatus(): SyncStatus {
  return {
    uploading: { current: activeUploads, total: uploadQueue.length + activeUploads, failed: totalFailed },
    syncing: false,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    mode,
  }
}

function notify() {
  const s = getStatus()
  listeners.forEach(fn => fn(s))
}

export function onStatusChange(fn: StatusListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

function maxConcurrency(): number {
  return mode === 'live' ? 2 : 3
}

function hasPrioritySlot(): boolean {
  return mode === 'live'
}

// ---------------------------------------------------------------------------
// Upload Queue
// ---------------------------------------------------------------------------

function processQueue() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return

  // Process priority jobs first in live mode
  if (hasPrioritySlot() && activeUploads < maxConcurrency() + 1) {
    const priorityIdx = uploadQueue.findIndex(j => j.priority)
    if (priorityIdx !== -1) {
      const job = uploadQueue.splice(priorityIdx, 1)[0]
      runUpload(job)
    }
  }

  // Fill remaining slots
  while (activeUploads < maxConcurrency() && uploadQueue.length > 0) {
    const job = uploadQueue.shift()!
    runUpload(job)
  }
}

async function runUpload(job: UploadJob) {
  activeUploads++
  notify()

  // Mark track as uploading in local DB
  await updateLocalTrackMeta(job.trackId, { uploadStatus: 'uploading' } as Partial<Track>)

  try {
    const { key } = await uploadToCloud(job.file, job.userId, job.trackId)

    // Update local metadata with minio_key
    await updateLocalTrackMeta(job.trackId, { minioKey: key, uploadStatus: 'uploaded' } as Partial<Track>)

    // Sync minio_key to PostgreSQL
    await fetch('/api/tracks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.trackId, minio_key: key }),
    })
  } catch (err) {
    console.error(`[syncEngine] Upload failed for ${job.trackId}:`, err)
    job.retries++
    if (job.retries < MAX_RETRIES) {
      // Exponential backoff: 1s, 4s, 16s
      const delay = Math.pow(4, job.retries - 1) * 1000
      setTimeout(() => {
        uploadQueue.push(job)
        processQueue()
      }, delay)
    } else {
      totalFailed++
      await updateLocalTrackMeta(job.trackId, { uploadStatus: 'failed' } as Partial<Track>)
    }
  } finally {
    activeUploads--
    notify()
    processQueue()
  }
}

export function enqueueUpload(trackId: string, file: File, priority = false) {
  if (!userId) {
    console.warn('[syncEngine] No userId — skipping upload')
    return
  }
  totalEnqueued++
  uploadQueue.push({ trackId, file, userId, priority, retries: 0 })
  notify()
  processQueue()
}

// ---------------------------------------------------------------------------
// Metadata Sync (PostgreSQL)
// ---------------------------------------------------------------------------

/** Map client Track (camelCase) to PostgreSQL fields (snake_case) */
function toDbFields(track: Track): Record<string, unknown> {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album,
    remixer: track.remixer,
    genre: track.genre,
    language: track.language,
    bpm: track.bpm,
    key: track.key,
    released: track.released,
    duration: track.duration,
    times_played: track.timesPlayed,
    file_name: track.file,
    minio_key: track.minioKey || null,
    bad_file: track.badFile || false,
    bad_reason: track.badReason || null,
    loudness: track.loudness || null,
    thumbnail_url: track.thumbnail || null,
    effective_end_time: track.effectiveEndTime || null,
  }
}

/** Map PostgreSQL row (snake_case) to client Track (camelCase) */
function fromDbRow(row: Record<string, unknown>): Partial<Track> {
  return {
    id: row.id as string,
    title: row.title as string,
    artist: row.artist as string,
    album: row.album as string,
    remixer: row.remixer as string,
    genre: row.genre as string,
    language: row.language as string | null,
    bpm: row.bpm as number,
    key: row.key as string,
    released: row.released as string,
    duration: row.duration as number,
    timesPlayed: row.times_played as number,
    file: row.file_name as string,
    minioKey: row.minio_key as string | undefined,
    badFile: row.bad_file as boolean,
    badReason: row.bad_reason as string | undefined,
    loudness: row.loudness as number | undefined,
    thumbnail: row.thumbnail_url as string | undefined,
    effectiveEndTime: row.effective_end_time as number | undefined,
  }
}

/** Sync a batch of tracks to PostgreSQL. Skips failures silently. */
export async function syncMetadata(tracks: Track[]) {
  if (!userId) return
  const BATCH = 50

  for (let i = 0; i < tracks.length; i += BATCH) {
    const batch = tracks.slice(i, i + BATCH)
    try {
      await Promise.allSettled(batch.map(track =>
        fetch('/api/tracks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: track.id, user_id: userId, ...toDbFields(track) }),
        }).then(async res => {
          if (res.status === 409) {
            // Already exists — update instead
            await fetch('/api/tracks', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: track.id, ...toDbFields(track) }),
            })
          }
        })
      ))
    } catch (err) {
      console.error('[syncEngine] Metadata batch sync error:', err)
    }
  }

  notifySync('tracks')
}

/** Sync a single track update to PostgreSQL */
export async function syncTrackUpdate(trackId: string, updates: Partial<Track>) {
  if (!userId) return
  try {
    const dbUpdates: Record<string, unknown> = {}
    if (updates.title !== undefined) dbUpdates.title = updates.title
    if (updates.artist !== undefined) dbUpdates.artist = updates.artist
    if (updates.album !== undefined) dbUpdates.album = updates.album
    if (updates.remixer !== undefined) dbUpdates.remixer = updates.remixer
    if (updates.genre !== undefined) dbUpdates.genre = updates.genre
    if (updates.language !== undefined) dbUpdates.language = updates.language
    if (updates.bpm !== undefined) dbUpdates.bpm = updates.bpm
    if (updates.key !== undefined) dbUpdates.key = updates.key
    if (updates.released !== undefined) dbUpdates.released = updates.released
    if (updates.timesPlayed !== undefined) dbUpdates.times_played = updates.timesPlayed
    if (updates.badFile !== undefined) dbUpdates.bad_file = updates.badFile
    if (updates.badReason !== undefined) dbUpdates.bad_reason = updates.badReason
    if (updates.loudness !== undefined) dbUpdates.loudness = updates.loudness
    if (updates.minioKey !== undefined) dbUpdates.minio_key = updates.minioKey

    if (Object.keys(dbUpdates).length > 0) {
      await fetch('/api/tracks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: trackId, ...dbUpdates }),
      })
      notifySync('tracks')
    }
  } catch (err) {
    console.error('[syncEngine] Track update sync error:', err)
  }
}

// ---------------------------------------------------------------------------
// Reconcile (pull cloud state into local)
// ---------------------------------------------------------------------------

/** Pull tracks from PostgreSQL, merge missing ones into local list */
export async function reconcile(): Promise<Partial<Track>[]> {
  if (!userId) {
    console.warn('[syncEngine] reconcile() called before userId set — returning empty')
    return []
  }
  try {
    const res = await fetch(`/api/tracks?userId=${userId}`, { credentials: 'same-origin' })
    if (!res.ok) {
      console.warn('[syncEngine] reconcile() HTTP error:', res.status)
      return []
    }
    const { tracks } = await res.json()
    console.log('[syncEngine] reconcile() fetched', tracks?.length || 0, 'tracks')
    return (tracks || []).map((row: Record<string, unknown>) => fromDbRow(row))
  } catch (err) {
    console.error('[syncEngine] Reconcile error:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Video URL Resolution
// ---------------------------------------------------------------------------

/** Track when each URL was generated (for refresh before expiry) */
const urlTimestamps = new Map<string, number>()
const URL_REFRESH_THRESHOLD = 20 * 60 * 60 * 1000 // 20 hours (URLs expire at 24h)

/** For tracks with minioKey but no videoUrl, fetch pre-signed stream URLs */
export async function resolveVideoUrls(tracks: Track[]): Promise<{ urls: Map<string, string>; failed: string[] }> {
  const urls = new Map<string, string>()
  const failed: string[] = []
  const needUrls = tracks.filter(t => !t.videoUrl && t.minioKey)

  await Promise.allSettled(needUrls.map(async track => {
    try {
      const url = await getStreamUrl(track.minioKey!)
      urls.set(track.id, url)
      urlTimestamps.set(track.id, Date.now())
    } catch (err) {
      console.error(`[syncEngine] Failed to resolve URL for ${track.title} (key: ${track.minioKey}):`, err)
      failed.push(track.id)
    }
  }))

  if (failed.length > 0) {
    console.warn(`[syncEngine] ${failed.length}/${needUrls.length} tracks failed URL resolution`)
  }

  return { urls, failed }
}

/** Refresh pre-signed URLs that are close to expiring (>20h old) */
export async function refreshExpiredUrls(tracks: Track[]): Promise<Map<string, string>> {
  const now = Date.now()
  const expiring = tracks.filter(t => {
    if (!t.videoUrl || !t.minioKey) return false
    if (t.videoUrl.startsWith('blob:')) return false // local files never expire
    const generated = urlTimestamps.get(t.id) || 0
    return (now - generated) > URL_REFRESH_THRESHOLD
  })
  if (expiring.length === 0) return new Map()

  const refreshed = new Map<string, string>()
  await Promise.allSettled(expiring.map(async track => {
    try {
      const url = await getStreamUrl(track.minioKey!)
      refreshed.set(track.id, url)
      urlTimestamps.set(track.id, Date.now())
    } catch {
      // Keep existing URL — it might still work for a few more hours
    }
  }))

  if (refreshed.size > 0) {
    console.log(`[syncEngine] Refreshed ${refreshed.size} expiring URLs`)
  }
  return refreshed
}

/** Resolve a single track's MinIO URL on-the-fly (for deck loading) */
export async function resolveTrackUrl(track: Track): Promise<string | null> {
  if (track.videoUrl) return track.videoUrl
  if (!track.minioKey) return null
  try {
    const url = await getStreamUrl(track.minioKey)
    urlTimestamps.set(track.id, Date.now())
    return url
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Conversation Sync
// ---------------------------------------------------------------------------

export async function syncConversation(data: {
  summary: string
  topics: string[]
  actions: string[]
  messageCount: number
}) {
  try {
    await fetch('/api/linus/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    notifySync('conversations')
  } catch (err) {
    console.error('[syncEngine] Conversation sync error:', err)
  }
}

// ---------------------------------------------------------------------------
// Playlist Sync
// ---------------------------------------------------------------------------

export async function syncPlaylist(playlist: { id: string; name: string; createdBy: string; trackIds: string[]; totalDuration: number }) {
  try {
    await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playlist),
    })
    notifySync('playlists')
  } catch (err) {
    console.error('[syncEngine] Playlist sync error:', err)
  }
}

export async function deletePlaylistFromCloud(id: string) {
  try {
    await fetch(`/api/playlists?id=${id}`, { method: 'DELETE' })
    notifySync('playlists')
  } catch (err) {
    console.error('[syncEngine] Playlist delete error:', err)
  }
}

export async function reconcilePlaylists(): Promise<Array<{ id: string; name: string; createdBy: 'user' | 'linus'; trackIds: string[]; totalDuration: number; createdAt: number }>> {
  if (!userId) return []
  try {
    const res = await fetch('/api/playlists')
    if (!res.ok) return []
    const { playlists } = await res.json()
    return (playlists || []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string,
      createdBy: ((p.created_by as string) === 'linus' ? 'linus' : 'user') as 'user' | 'linus',
      trackIds: (p.track_ids as string[]) || [],
      totalDuration: (p.total_duration as number) || 0,
      createdAt: new Date(p.created_at as string).getTime(),
    }))
  } catch (err) {
    console.error('[syncEngine] Playlist reconcile error:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Real-time Sync (SSE)
// ---------------------------------------------------------------------------

let eventSource: EventSource | null = null
let syncListeners: Array<(type: string) => void> = []

/** Notify other devices/tabs that data changed */
async function notifySync(type: string) {
  if (!userId) return
  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, userId }),
    })
  } catch {
    // Non-critical — other tabs will catch up on next poll
  }
}

/** Subscribe to real-time sync events from other devices */
export function onSyncEvent(fn: (type: string) => void): () => void {
  syncListeners.push(fn)
  return () => {
    syncListeners = syncListeners.filter(l => l !== fn)
  }
}

function startSSE() {
  if (!userId || typeof window === 'undefined') return
  if (eventSource) eventSource.close()

  eventSource = new EventSource(`/api/sync?userId=${userId}`)
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'heartbeat' || data.type === 'connected') return
      console.log(`[syncEngine] SSE event: ${data.type}`)
      syncListeners.forEach(fn => fn(data.type))
    } catch { /* ignore parse errors */ }
  }
  eventSource.onerror = () => {
    // Reconnect after 5s
    eventSource?.close()
    eventSource = null
    setTimeout(startSSE, 5000)
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function setMode(newMode: SyncMode) {
  mode = newMode
  notify()
}

export async function start(): Promise<string | null> {
  // Resolve current user
  try {
    const res = await fetch('/api/auth/session', { credentials: 'same-origin' })
    const data = await res.json()
    userId = data.userId
    console.log('[syncEngine] start() resolved userId:', userId)
  } catch (err) {
    console.error('[syncEngine] start() failed:', err)
    userId = null
  }

  // Listen for online/offline
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { notify(); processQueue() })
    window.addEventListener('offline', () => notify())
  }

  // Start SSE for real-time sync
  startSSE()

  return userId
}

export function getUserId(): string | null {
  return userId
}
