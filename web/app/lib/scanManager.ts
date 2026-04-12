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
import { extractFastMetadata } from '@/app/lib/extractMetadata'
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
    phase: 'finding',
    total: files.length,
    current: 0,
    count: 0,
    currentFile: '',
    startTime: Date.now(),
  }
  notify()

  const allVideoFiles = files.filter(f => VIDEO_EXTENSIONS.test(f.name))

  // ── STEP 1: Check database for existing files (fast DB query) ──
  state.phase = 'finding'
  state.currentFile = 'Checking library...'
  state.total = allVideoFiles.length
  notify()

  const existing = (await syncEngine.reconcile()) as Track[]

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

  // Refresh file refs for duplicates so playback works in this session
  for (const { existingTrack, file } of duplicateFiles) {
    setFileRef(existingTrack.id, file)
  }

  // ── STEP 2: Fast metadata extraction — tags only, no audio decode ──
  state.phase = 'processing'
  state.total = newFiles.length
  state.current = 0
  state.currentFile = newFiles.length > 0 ? 'Reading file tags...' : 'No new files'
  notify()

  const items: { track: Track; blob: File }[] = []

  // Process 50 at a time — tag reading is instant, no video element overhead
  const SCAN_BATCH = 50

  for (let i = 0; i < newFiles.length; i += SCAN_BATCH) {
    const batch = newFiles.slice(i, i + SCAN_BATCH)
    const results = await Promise.allSettled(batch.map(async (file) => {
      const name = file.name.replace(VIDEO_EXTENSIONS, '')
      const meta = await extractFastMetadata(file)
      const id = crypto.randomUUID()
      return {
        track: {
          id, title: name, artist: meta.artist, album: meta.album,
          remixer: '', genre: meta.genre, language: meta.language, bpm: meta.bpm,
          key: meta.key, released: '', duration: meta.duration, timesPlayed: 0,
          thumbnail: meta.thumbnail, file: file.name,
          videoUrl: URL.createObjectURL(file),
        } as Track,
        blob: file,
      }
    }))

    for (const result of results) {
      if (result.status === 'fulfilled') items.push(result.value)
    }

    state.current = Math.min(i + SCAN_BATCH, newFiles.length)
    state.count = items.length
    state.currentFile = batch[batch.length - 1].name.replace(VIDEO_EXTENSIONS, '').slice(0, 37)
    notify()
  }

  // ── STEP 3: Save metadata to PostgreSQL ──
  state.phase = 'saving'
  state.currentFile = `Saving ${items.length} tracks...`
  notify()

  const newTracks = items.map(i => i.track)

  if (items.length > 0) {
    // Store file refs for immediate playback
    for (const item of items) {
      setFileRef(item.track.id, item.blob)
    }

    // Sync metadata to PostgreSQL — no MinIO upload, files play from local disk
    if (syncEngine.getUserId()) {
      await syncEngine.syncMetadata(newTracks)
    }
  }

  // Build merged library
  const merged: Track[] = [
    ...existing.map(t => {
      const refreshed = duplicateFiles.find(d => d.existingTrack.id === t.id)
      return refreshed ? { ...t, videoUrl: URL.createObjectURL(refreshed.file) } : t
    }),
    ...newTracks,
  ]

  state = {
    scanning: false,
    phase: 'done',
    total: allVideoFiles.length,
    current: allVideoFiles.length,
    count: items.length,
    currentFile: '',
    startTime: state.startTime,
  }
  notify()

  if (onCompleteCallback) onCompleteCallback(merged)

  const skippedCount = duplicateFiles.length
  if (items.length > 0) {
    toast.success(skippedCount > 0 ? `${items.length} new + ${skippedCount} already in library` : `${items.length} videos added`)
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
