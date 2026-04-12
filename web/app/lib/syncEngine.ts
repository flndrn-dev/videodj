/**
 * syncEngine — background sync orchestrator for videoDJ.Studio
 *
 * Handles:
 * - Metadata sync: track data -> PostgreSQL (batched, write-through)
 * - Conversation sync: Linus summaries -> PostgreSQL
 * - Reconcile: pull PostgreSQL state -> merge into local on load
 * - Real-time sync: SSE events between tabs/devices
 */

import type { Track } from '@/app/hooks/usePlayerStore'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let userId: string | null = null

// ---------------------------------------------------------------------------
// Metadata Sync (PostgreSQL)
// ---------------------------------------------------------------------------

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
    badFile: row.bad_file as boolean,
    badReason: row.bad_reason as string | undefined,
    loudness: row.loudness as number | undefined,
    thumbnail: row.thumbnail_url as string | undefined,
    effectiveEndTime: row.effective_end_time as number | undefined,
    effectiveStartTime: row.effective_start_time as number | undefined,
  }
}

/** Sync tracks to PostgreSQL — single bulk insert, not one-at-a-time. */
export async function syncMetadata(tracks: Track[]) {
  if (!userId) {
    console.warn('[syncEngine] syncMetadata skipped — no userId')
    return
  }

  console.log(`[syncEngine] Bulk saving ${tracks.length} tracks to PostgreSQL...`)

  try {
    const trackData = tracks.map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      genre: t.genre,
      language: t.language,
      bpm: t.bpm,
      key: t.key,
      released: t.released,
      duration: t.duration,
      file_name: t.file,
      thumbnail: t.thumbnail,
    }))

    const res = await fetch('/api/tracks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ tracks: trackData, userId }),
    })

    if (res.ok) {
      const data = await res.json()
      console.log(`[syncEngine] Bulk save complete: ${data.inserted} inserted, ${data.skipped} skipped`)
    } else {
      const err = await res.text()
      console.error('[syncEngine] Bulk save failed:', res.status, err)
    }
  } catch (err) {
    console.error('[syncEngine] Bulk save error:', err)
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
    if (updates.effectiveStartTime !== undefined) dbUpdates.effective_start_time = updates.effectiveStartTime
    if (updates.effectiveEndTime !== undefined) dbUpdates.effective_end_time = updates.effectiveEndTime

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
// Reconcile (pull PostgreSQL state into local)
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
// Conversation Sync
// ---------------------------------------------------------------------------

export async function syncConversation(data: {
  sessionId: string
  messages: { role: string; text: string }[]
  summary?: string
  provider?: string
  model?: string
}) {
  if (!userId) {
    console.warn('[syncEngine] syncConversation skipped — no userId. User not logged in.')
    return
  }
  try {
    const res = await fetch('/api/linus/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ...data, userId }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.warn('[syncEngine] Conversation sync failed:', res.status, err)
    } else {
      console.log('[syncEngine] Conversation synced:', data.sessionId, data.messages?.length, 'msgs')
      notifySync('conversations')
    }
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

  // Start SSE for real-time sync
  startSSE()

  return userId
}

export function getUserId(): string | null {
  return userId
}
