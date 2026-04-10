/**
 * scanManager — runs folder scans outside of component lifecycle
 *
 * The SetupModal can close and reopen during a scan. This module
 * holds the scan state so it survives modal unmounts. When the scan
 * completes, it calls the callback and shows a toast regardless of
 * whether the modal is still open.
 */

import type { Track } from '@/app/hooks/usePlayerStore'
import { setFileRef } from '@/app/lib/db'
import { extractVideoMetadata } from '@/app/lib/extractMetadata'
import { toast } from 'sonner'
import * as syncEngine from '@/app/lib/syncEngine'

const VIDEO_EXTENSIONS = /\.(mp4|mkv|avi|mov|webm|m4v)$/i

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface ScanState {
  scanning: boolean
  phase: 'finding' | 'processing' | 'saving' | 'done'
  total: number
  current: number
  count: number
  currentFile: string
  startTime: number
}

let state: ScanState = {
  scanning: false,
  phase: 'finding',
  total: 0,
  current: 0,
  count: 0,
  currentFile: '',
  startTime: 0,
}

type StateListener = (s: ScanState) => void
const listeners = new Set<StateListener>()
let onCompleteCallback: ((tracks: Track[]) => void) | null = null

function notify() {
  listeners.forEach(fn => fn({ ...state }))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getState(): ScanState {
  return { ...state }
}

export function isScanning(): boolean {
  return state.scanning
}

export function onStateChange(fn: StateListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setOnComplete(fn: (tracks: Track[]) => void) {
  onCompleteCallback = fn
}

/** Start processing files (called after folder picker or file input) */
export async function processFiles(files: File[]) {
  state = {
    scanning: true,
    phase: 'processing',
    total: files.length,
    current: 0,
    count: 0,
    currentFile: '',
    startTime: Date.now(),
  }
  notify()

  const items: { track: Track; blob: Blob }[] = []

  // Filter video files first
  const videoFiles = files.filter(f => VIDEO_EXTENSIONS.test(f.name))
  state.total = videoFiles.length
  notify()

  // Process metadata in parallel batches of 4 for speed
  const SCAN_CONCURRENCY = 4

  for (let i = 0; i < videoFiles.length; i += SCAN_CONCURRENCY) {
    const batch = videoFiles.slice(i, i + SCAN_CONCURRENCY)
    const results = await Promise.allSettled(batch.map(async (file) => {
      const name = file.name.replace(VIDEO_EXTENSIONS, '')
      const videoUrl = URL.createObjectURL(file)
      const meta = await extractVideoMetadata(file)
      const id = crypto.randomUUID()
      return {
        track: {
          id, title: name, artist: meta.artist, album: meta.album,
          remixer: '', genre: meta.genre, language: meta.language, bpm: meta.bpm,
          key: meta.key, released: '', duration: meta.duration, timesPlayed: 0,
          thumbnail: meta.thumbnail, file: file.name, videoUrl,
          effectiveStartTime: meta.effectiveStartTime,
          effectiveEndTime: meta.effectiveEndTime,
          loudness: meta.loudness,
        } as Track,
        blob: file,
      }
    }))

    for (const result of results) {
      if (result.status === 'fulfilled') items.push(result.value)
    }

    state.current = Math.min(i + SCAN_CONCURRENCY, videoFiles.length)
    state.count = items.length
    state.currentFile = batch[batch.length - 1].name.replace(VIDEO_EXTENSIONS, '').slice(0, 37)
    notify()
  }

  state.phase = 'saving'
  state.currentFile = 'Checking for duplicates...'
  notify()

  // Fetch existing tracks from PostgreSQL (not IndexedDB)
  const existing = (await syncEngine.reconcile()) as Track[]

  // Multi-strategy duplicate detection:
  //  1. Same filename (exact match, case-insensitive)
  //  2. Same artist + title (normalized — strips brackets, feat., punctuation)
  //  3. Same duration ±2s + similar title (catches re-encodes)
  const normalize = (s: string) => (s || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')   // strip (Official Video), [HD], etc.
    .replace(/\bfeat\.?|\bft\.?|\bvs\.?|\bversus\b/gi, '')
    .replace(/[^\w\s]/g, '')           // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()

  const existingFiles = new Set(existing.map(t => t.file?.toLowerCase()).filter(Boolean))
  const existingArtistTitle = new Set(
    existing
      .filter(t => t.artist && t.title)
      .map(t => `${normalize(t.artist)}::${normalize(t.title)}`)
  )
  const existingByDuration = new Map<number, Track[]>()
  for (const t of existing) {
    if (t.duration > 0) {
      const bucket = Math.round(t.duration)
      if (!existingByDuration.has(bucket)) existingByDuration.set(bucket, [])
      existingByDuration.get(bucket)!.push(t)
    }
  }

  // Build a map: existing track -> matching new item (to refresh file refs for duplicates)
  const findExisting = (t: Track): Track | null => {
    if (t.file) {
      const m = existing.find(e => e.file?.toLowerCase() === t.file?.toLowerCase())
      if (m) return m
    }
    if (t.artist && t.title) {
      const key = `${normalize(t.artist)}::${normalize(t.title)}`
      const m = existing.find(e => e.artist && e.title && `${normalize(e.artist)}::${normalize(e.title)}` === key)
      if (m) return m
    }
    if (t.duration > 0 && t.title) {
      const normTitle = normalize(t.title)
      for (let d = -2; d <= 2; d++) {
        const bucket = existingByDuration.get(Math.round(t.duration) + d)
        const m = bucket?.find(et => normalize(et.title) === normTitle)
        if (m) return m
      }
    }
    return null
  }

  const newItems: typeof items = []
  const refreshedItems: { existingTrack: Track; file: File }[] = []

  for (const item of items) {
    const match = findExisting(item.track)
    if (match) {
      // Duplicate — refresh File ref so playback works in this session
      // Also queue upload if duplicate doesn't have minioKey yet
      refreshedItems.push({ existingTrack: match, file: item.blob as File })
    } else {
      newItems.push(item)
    }
  }

  // Refresh File refs for duplicates so playback works in this session
  // loadAllTracks() below will pick up the new refs and attach fresh videoUrls
  for (const { existingTrack, file } of refreshedItems) {
    setFileRef(existingTrack.id, file)
    // Queue upload if no minioKey yet
    if (!existingTrack.minioKey && syncEngine.getUserId()) {
      syncEngine.enqueueUpload(existingTrack.id, file)
    }
  }

  const newTracks = newItems.map(i => i.track)

  if (newItems.length > 0) {
    state.currentFile = `Saving ${newItems.length} tracks to database...`
    notify()

    // Store File refs in memory so playback works immediately for new tracks
    for (const item of newItems) {
      if (item.blob instanceof File) {
        setFileRef(item.track.id, item.blob as File)
      }
    }

    // Sync metadata to PostgreSQL (source of truth)
    if (syncEngine.getUserId()) {
      await syncEngine.syncMetadata(newTracks)

      // Queue MinIO uploads for new tracks
      for (const item of newItems) {
        if (item.blob instanceof File) {
          syncEngine.enqueueUpload(item.track.id, item.blob as File)
        }
      }
    }
  }

  // Build merged library: existing PostgreSQL tracks + newly added tracks (with local videoUrls)
  const merged: Track[] = [
    ...existing.map(t => {
      // Re-attach local videoUrl if we just refreshed the file ref for this track
      const refreshed = refreshedItems.find(r => r.existingTrack.id === t.id)
      if (refreshed) {
        return { ...t, videoUrl: URL.createObjectURL(refreshed.file) }
      }
      return t
    }),
    ...newTracks,
  ]

  state = {
    scanning: false,
    phase: 'done',
    total: state.total,
    current: state.total,
    count: newItems.length,
    currentFile: '',
    startTime: state.startTime,
  }
  notify()

  // Notify via callback (updates library in page.tsx)
  if (onCompleteCallback) {
    onCompleteCallback(merged)
  }

  // Toast notification — visible even if modal is closed
  const refreshedCount = refreshedItems.length
  if (newItems.length > 0) {
    if (refreshedCount > 0) {
      toast.success(`${newItems.length} new + ${refreshedCount} refreshed`)
    } else {
      toast.success(`${newItems.length} videos added`)
    }
  } else if (refreshedCount > 0) {
    toast.success(`${refreshedCount} videos refreshed for playback`)
  } else if (items.length > 0) {
    toast.info('All videos were already in the library')
  } else {
    toast.info('No video files found')
  }
}

/** Pick a folder and start scanning. Returns false if the API isn't available (caller should fallback to file input). */
export async function selectFolder(): Promise<boolean> {
  if (state.scanning) return true

  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: 'read' })

      state = { scanning: true, phase: 'finding', total: 0, current: 0, count: 0, currentFile: '', startTime: Date.now() }
      notify()

      const files: File[] = []
      async function scan(handle: FileSystemDirectoryHandle) {
        for await (const entry of (handle as any).values()) {
          if (entry.kind === 'file' && VIDEO_EXTENSIONS.test(entry.name)) {
            const file: File = await entry.getFile()
            files.push(file)
            state.count = files.length
            notify()
          } else if (entry.kind === 'directory') {
            await scan(entry)
          }
        }
      }
      await scan(dir)
      await processFiles(files)
      return true
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        state.scanning = false
        notify()
      }
      return true
    }
  }

  return false // API not available — caller should use file input fallback
}

export function reset() {
  if (!state.scanning) {
    state = { scanning: false, phase: 'finding', total: 0, current: 0, count: 0, currentFile: '', startTime: 0 }
    notify()
  }
}
