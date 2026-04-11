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

  // Filter video files first
  const allVideoFiles = files.filter(f => VIDEO_EXTENSIONS.test(f.name))

  // ── STEP 1: Check database BEFORE processing ──────────────────
  // This avoids expensive metadata extraction for files already in the library
  state.phase = 'finding'
  state.currentFile = 'Checking library for existing files...'
  state.total = allVideoFiles.length
  notify()

  const existing = (await syncEngine.reconcile()) as Track[]
  const existingFileNames = new Set(existing.map(t => t.file?.toLowerCase()).filter(Boolean))

  // Split into new files (need processing) and duplicates (just refresh file refs)
  const newFiles: File[] = []
  const duplicateFiles: { file: File; existingTrack: Track }[] = []

  for (const file of allVideoFiles) {
    const match = existing.find(e => e.file?.toLowerCase() === file.name.toLowerCase())
    if (match) {
      duplicateFiles.push({ file, existingTrack: match })
    } else {
      newFiles.push(file)
    }
  }

  state.currentFile = `${newFiles.length} new, ${duplicateFiles.length} already in library`
  notify()

  // Refresh File refs for duplicates so playback works in this session
  for (const { existingTrack, file } of duplicateFiles) {
    setFileRef(existingTrack.id, file)
    if (!existingTrack.minioKey && syncEngine.getUserId()) {
      syncEngine.enqueueUpload(existingTrack.id, file)
    }
  }

  // ── STEP 2: Process only NEW files ─────────────────────────────
  state.phase = 'processing'
  state.total = newFiles.length
  state.current = 0
  state.count = 0
  state.currentFile = newFiles.length > 0 ? 'Processing new files...' : 'No new files to process'
  notify()

  const items: { track: Track; blob: Blob }[] = []

  if (newFiles.length > 0) {
    // Process metadata in parallel batches of 4 for speed
    const SCAN_CONCURRENCY = 4

    for (let i = 0; i < newFiles.length; i += SCAN_CONCURRENCY) {
      const batch = newFiles.slice(i, i + SCAN_CONCURRENCY)
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

      state.current = Math.min(i + SCAN_CONCURRENCY, newFiles.length)
      state.count = items.length
      state.currentFile = batch[batch.length - 1].name.replace(VIDEO_EXTENSIONS, '').slice(0, 37)
      notify()
    }
  }

  // ── STEP 3: Save new tracks ────────────────────────────────────
  state.phase = 'saving'
  state.currentFile = 'Saving new tracks...'
  notify()

  // No need for the old duplicate detection — we already filtered above
  // But keep advanced detection (artist+title matching) for edge cases
  const normalize = (s: string) => (s || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\bfeat\.?|\bft\.?|\bvs\.?|\bversus\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const existingArtistTitle = new Set(
    existing.filter(t => t.artist && t.title)
      .map(t => `${normalize(t.artist)}::${normalize(t.title)}`)
  )

  // Filter out any items that match by artist+title (catches re-encodes with different filenames)
  const newItems = items.filter(item => {
    if (item.track.artist && item.track.title) {
      const key = `${normalize(item.track.artist)}::${normalize(item.track.title)}`
      if (existingArtistTitle.has(key)) return false
    }
    return true
  })

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
      const refreshed = duplicateFiles.find(d => d.existingTrack.id === t.id)
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
    total: allVideoFiles.length,
    current: allVideoFiles.length,
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
  const skippedCount = duplicateFiles.length
  if (newItems.length > 0) {
    if (skippedCount > 0) {
      toast.success(`${newItems.length} new + ${skippedCount} already in library`)
    } else {
      toast.success(`${newItems.length} videos added`)
    }
  } else if (skippedCount > 0) {
    toast.success(`${skippedCount} videos refreshed — all already in library`)
  } else if (allVideoFiles.length > 0) {
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
