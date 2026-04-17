/**
 * scanManager — runs folder scans outside of component lifecycle
 *
 * The SetupModal can close and reopen during a scan. This module
 * holds the scan state so it survives modal unmounts. When the scan
 * completes, it calls the callback and shows a toast regardless of
 * whether the modal is still open.
 */

import type { Track } from '@/app/hooks/usePlayerStore'
import { setFileRef, getFileRef, saveDirectoryHandle, loadDirectoryHandle } from '@/app/lib/db'
import { extractFastMetadata } from '@/app/lib/extractMetadata'
import { toast } from 'sonner'
import * as syncEngine from '@/app/lib/syncEngine'
import {
  isElectronNativeLibraryAvailable,
  pickElectronLibrary,
  restoreElectronLibrary,
  electronFileUrl,
  type ElectronFileRef,
} from '@/app/lib/electronLibrary'

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

    // Sync metadata to PostgreSQL — files play from local disk
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

  // ── STEP 4: Background health scan — verify all tracks are playable ──
  // Runs silently after library is loaded, updates badFile status in PostgreSQL
  if (merged.length > 0) {
    setTimeout(() => {
      runBackgroundHealthScan(merged)
    }, 2000)
  }

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

/**
 * Pick a folder and start scanning.
 *
 * In Electron: uses the OS-native dialog + native fs walk. The path is
 * persisted in Electron's userData, so later boots can auto-restore
 * without any picker, permission prompt, or user interaction.
 *
 * In the browser: falls back to showDirectoryPicker. If that API isn't
 * available the caller should fall back to a plain file input.
 *
 * Returns false if no folder-picker API is available.
 */
export async function selectFolder(): Promise<boolean> {
  if (state.scanning) return true

  // Electron native FS takes priority — no permission model, reconnects
  // silently after refresh.
  if (isElectronNativeLibraryAvailable()) {
    try {
      const lib = await pickElectronLibrary()
      if (!lib) return true // user cancelled
      await processElectronFiles(lib.files)
      return true
    } catch (err) {
      console.error('[selectFolder] Electron pick failed:', err)
      state.scanning = false
      notify()
      return true
    }
  }

  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: 'read' })

      // Persist handle so we can reconnect after page refresh
      try {
        await saveDirectoryHandle(dir)
        console.log('[selectFolder] Directory handle saved to IndexedDB')
      } catch (err) {
        console.error('[selectFolder] FAILED to save directory handle:', err)
      }

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

// ---------------------------------------------------------------------------
// Electron-native path — build tracks from ElectronFileRef objects.
//
// Unlike the browser flow these entries already have absolute file paths,
// so we don't need File objects or object URLs. Playback reads directly
// from file:// URLs (webSecurity is disabled in the BrowserWindow config).
// Metadata extraction that needs file bytes is skipped here; the renderer
// can lazy-extract later on playback if needed. Postgres remains the
// source of truth for metadata, so re-scanning an existing track doesn't
// overwrite anything the user has already curated.
// ---------------------------------------------------------------------------

export async function processElectronFiles(refs: ElectronFileRef[]) {
  state = {
    scanning: true,
    phase: 'finding',
    total: refs.length,
    current: 0,
    count: 0,
    currentFile: 'Checking library…',
    startTime: Date.now(),
  }
  notify()

  const existing = (await syncEngine.reconcile()) as Track[]

  // Match Electron files to existing Postgres tracks by filename. Any
  // unmatched files become new Track rows below.
  const existingByFile = new Map<string, Track>()
  for (const t of existing) {
    if (t.file) existingByFile.set(t.file.toLowerCase(), t)
  }

  const newRefs: ElectronFileRef[] = []
  const rematched: Track[] = []

  for (const ref of refs) {
    const hit = existingByFile.get(ref.name.toLowerCase())
    if (hit) {
      rematched.push({ ...hit, videoUrl: electronFileUrl(ref.path) })
    } else {
      newRefs.push(ref)
    }
  }

  // Build Track objects for files we've never seen. No audio decode —
  // tag extraction only happens if the user explicitly re-indexes later.
  state.phase = 'processing'
  state.total = newRefs.length
  state.current = 0
  state.currentFile = newRefs.length > 0 ? 'Registering new files…' : 'No new files'
  notify()

  const newTracks: Track[] = []
  for (let i = 0; i < newRefs.length; i++) {
    const ref = newRefs[i]
    const title = ref.name.replace(VIDEO_EXTENSIONS, '')
    newTracks.push({
      id: crypto.randomUUID(),
      title,
      artist: '',
      album: '',
      remixer: '',
      genre: '',
      language: '',
      bpm: 0,
      key: '',
      released: '',
      duration: 0,
      timesPlayed: 0,
      thumbnail: '',
      file: ref.name,
      videoUrl: electronFileUrl(ref.path),
    } as Track)

    state.current = i + 1
    state.count = rematched.length + newTracks.length
    state.currentFile = title.slice(0, 37)
    if (i % 50 === 0) notify()
  }

  state.phase = 'saving'
  state.currentFile = `Saving ${newTracks.length} tracks…`
  notify()

  if (newTracks.length > 0 && syncEngine.getUserId()) {
    await syncEngine.syncMetadata(newTracks)
  }

  // Every Postgres track that used to exist but didn't match a file on
  // disk stays in the library with no videoUrl — it'll show "file
  // missing" in the UI, not disappear.
  const missing = existing
    .filter((t) => !rematched.find((r) => r.id === t.id))
    .map((t) => ({ ...t, videoUrl: undefined }))

  const merged: Track[] = [...rematched, ...newTracks, ...missing]

  state = {
    scanning: false,
    phase: 'done',
    total: refs.length,
    current: refs.length,
    count: rematched.length + newTracks.length,
    currentFile: '',
    startTime: state.startTime,
  }
  notify()

  if (onCompleteCallback) onCompleteCallback(merged)

  const reconnectedCount = rematched.length
  if (newTracks.length > 0) {
    toast.success(
      reconnectedCount > 0
        ? `${newTracks.length} new + ${reconnectedCount} reconnected`
        : `${newTracks.length} videos added`
    )
  } else if (reconnectedCount > 0) {
    toast.success(`${reconnectedCount} tracks reconnected`)
  }
}

/**
 * Silently restore the previously-picked Electron library on boot.
 * Returns true if a library was restored (the caller can stop showing
 * the "select folder" UI), false if there was nothing to restore.
 */
export async function restoreElectronFolder(): Promise<boolean> {
  if (!isElectronNativeLibraryAvailable()) return false
  try {
    const lib = await restoreElectronLibrary()
    if (!lib || !lib.rootPath) return false
    if (lib.missing) {
      toast.warning('Saved music folder was not found — please re-select it')
      return false
    }
    await processElectronFiles(lib.files)
    return true
  } catch (err) {
    console.error('[restoreElectronFolder] failed:', err)
    return false
  }
}

/**
 * Check if a persisted directory handle exists and has permission.
 * Returns 'granted' | 'prompt' | 'none'
 * - 'granted': can reconnect silently (same browser session)
 * - 'prompt': handle exists but needs user click to grant permission
 * - 'none': no persisted handle
 */
export async function checkPersistedFolder(): Promise<'granted' | 'prompt' | 'none'> {
  try {
    const handle = await loadDirectoryHandle()
    console.log('[checkPersistedFolder] Handle from IndexedDB:', handle ? `found (${handle.name})` : 'null')
    if (!handle) return 'none'
    const permission = await (handle as any).queryPermission({ mode: 'read' })
    console.log('[checkPersistedFolder] Permission:', permission)
    return permission === 'granted' ? 'granted' : 'prompt'
  } catch (err) {
    console.error('[checkPersistedFolder] Error:', err)
    return 'none'
  }
}

/**
 * Reconnect to a previously selected folder after page refresh.
 *
 * @param existingTracks — tracks from PostgreSQL to match files against
 * @param userGesture — true if called from a user click (can requestPermission)
 */
export async function reconnectFolder(existingTracks: Partial<Track>[], userGesture = false): Promise<Track[] | null> {
  try {
    const handle = await loadDirectoryHandle()
    if (!handle) return null

    // Check permission — queryPermission doesn't need user gesture
    let permission = await (handle as any).queryPermission({ mode: 'read' })

    if (permission !== 'granted') {
      if (userGesture) {
        // User clicked a button — we can request permission
        permission = await (handle as any).requestPermission({ mode: 'read' })
      }
      if (permission !== 'granted') {
        console.log('[reconnectFolder] Permission not granted')
        return null
      }
    }

    console.log('[reconnectFolder] Reconnecting to persisted folder...')

    // Walk the folder and collect File objects
    const files: File[] = []
    async function walk(dir: FileSystemDirectoryHandle) {
      for await (const entry of (dir as any).values()) {
        if (entry.kind === 'file' && VIDEO_EXTENSIONS.test(entry.name)) {
          files.push(await entry.getFile())
        } else if (entry.kind === 'directory') {
          await walk(entry)
        }
      }
    }
    await walk(handle)

    console.log(`[reconnectFolder] Found ${files.length} files, matching to ${existingTracks.length} tracks`)

    // Match files to existing tracks by filename and create blob URLs
    let matched = 0
    const fileMap = new Map<string, File>()
    for (const file of files) {
      fileMap.set(file.name.toLowerCase(), file)
    }

    const reconnected = existingTracks.map(track => {
      const file = track.file ? fileMap.get(track.file.toLowerCase()) : null
      if (file) {
        setFileRef(track.id!, file)
        matched++
        return { ...track, videoUrl: URL.createObjectURL(file) } as Track
      }
      return track as Track
    })

    console.log(`[reconnectFolder] Matched ${matched}/${existingTracks.length} tracks to files`)
    if (matched > 0) toast.success(`${matched} tracks reconnected`)
    return reconnected
  } catch (err) {
    console.warn('[reconnectFolder] Failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Health Scan — test each track's playability via hidden video element
// ---------------------------------------------------------------------------

export interface HealthResult {
  total: number
  healthy: number
  broken: number
  noFile: number
}

// Callback for UI updates when a track's health status changes
type HealthUpdateCallback = (trackId: string, badFile: boolean, badReason: string | null) => void
let healthUpdateCallback: HealthUpdateCallback | null = null

/** Register a callback to receive real-time health scan updates (for UI icon updates) */
export function onHealthUpdate(fn: HealthUpdateCallback): () => void {
  healthUpdateCallback = fn
  return () => { if (healthUpdateCallback === fn) healthUpdateCallback = null }
}

/** Background health scan — called automatically after folder scan */
async function runBackgroundHealthScan(tracks: Track[]) {
  console.log(`[healthScan] Starting background scan of ${tracks.length} tracks...`)
  await healthScan(tracks, (trackId, badFile, badReason) => {
    if (healthUpdateCallback) healthUpdateCallback(trackId, badFile, badReason)
  })
}

type HealthListener = (progress: { done: number; total: number; current: string; healthy: number; broken: number }) => void
let healthListeners: HealthListener[] = []

export function onHealthProgress(fn: HealthListener): () => void {
  healthListeners.push(fn)
  return () => { healthListeners = healthListeners.filter(l => l !== fn) }
}

/**
 * Test each track by loading into a hidden video element.
 * Only flags as broken on actual errors — timeouts get benefit of the doubt.
 * Clears bad_file flag for tracks that pass.
 */
export async function healthScan(
  tracks: Track[],
  onUpdate: (trackId: string, badFile: boolean, badReason: string | null) => void,
): Promise<HealthResult> {
  const result: HealthResult = { total: tracks.length, healthy: 0, broken: 0, noFile: 0 }

  const testable = tracks.filter(t => t.videoUrl || getFileRef(t.id))
  result.noFile = tracks.length - testable.length

  console.log(`[healthScan] Testing ${testable.length} tracks`)
  toast.info(`Health scan: testing ${testable.length} tracks...`)

  const CONCURRENCY = 3
  let done = 0

  async function testOne(track: Track): Promise<void> {
    const videoUrl = track.videoUrl || (getFileRef(track.id) ? URL.createObjectURL(getFileRef(track.id)!) : null)
    if (!videoUrl) { result.noFile++; done++; return }

    try {
      const status = await new Promise<'ok' | 'broken' | 'timeout'>((resolve) => {
        const vid = document.createElement('video')
        vid.preload = 'metadata'
        // 15s timeout — generous for large files / slow codecs
        const timeout = setTimeout(() => { vid.src = ''; resolve('timeout') }, 15000)
        vid.onloadedmetadata = () => {
          clearTimeout(timeout)
          resolve(vid.duration > 0 && isFinite(vid.duration) ? 'ok' : 'broken')
          vid.src = ''
        }
        // Only actual errors = broken (not timeouts)
        vid.onerror = () => { clearTimeout(timeout); vid.src = ''; resolve('broken') }
        vid.src = videoUrl
      })

      if (status === 'ok' || status === 'timeout') {
        // Timeout = benefit of the doubt — file might just be slow to decode
        result.healthy++
        if (track.badFile) {
          onUpdate(track.id, false, null)
          await syncEngine.syncTrackUpdate(track.id, { badFile: false, badReason: undefined })
        }
      } else {
        // Only actual video errors flag as broken
        result.broken++
        if (!track.badFile) {
          onUpdate(track.id, true, 'Video element error — file may be corrupt')
          await syncEngine.syncTrackUpdate(track.id, { badFile: true, badReason: 'Video element error — file may be corrupt' })
        }
      }
    } catch {
      // Exception = treat as healthy (benefit of the doubt)
      result.healthy++
    }

    done++
    healthListeners.forEach(fn => fn({
      done, total: testable.length,
      current: track.title || track.file || '',
      healthy: result.healthy, broken: result.broken,
    }))
  }

  for (let i = 0; i < testable.length; i += CONCURRENCY) {
    await Promise.all(testable.slice(i, i + CONCURRENCY).map(testOne))
  }

  console.log(`[healthScan] Done: ${result.healthy} healthy, ${result.broken} broken`)
  toast.success(`Health scan: ${result.healthy} healthy, ${result.broken} broken`)
  return result
}

/** Test a single track — used by the "Test Play" button on red-flagged tracks */
export async function testSingleTrack(track: Track): Promise<boolean> {
  const videoUrl = track.videoUrl || (getFileRef(track.id) ? URL.createObjectURL(getFileRef(track.id)!) : null)
  if (!videoUrl) return false

  return new Promise((resolve) => {
    const vid = document.createElement('video')
    vid.preload = 'auto'
    const timeout = setTimeout(() => { vid.src = ''; resolve(true) }, 15000) // timeout = pass
    vid.oncanplay = () => {
      clearTimeout(timeout)
      // Try to actually play 0.5 seconds
      vid.play().then(() => {
        setTimeout(() => { vid.pause(); vid.src = ''; resolve(true) }, 500)
      }).catch(() => {
        vid.src = ''; resolve(false)
      })
    }
    vid.onerror = () => { clearTimeout(timeout); vid.src = ''; resolve(false) }
    vid.src = videoUrl
  })
}
