'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Header } from '@/components/Header'
import { DeckPanel, EQSlider, type DeckPanelHandle } from '@/components/deck/DeckPanel'
import { CrossFader } from '@/components/CrossFader'
import { CommandBar, type CommandBarHandle } from '@/components/command/CommandBar'
import { PlaylistPanel } from '@/components/playlist/PlaylistPanel'
import { SetupModal } from '@/components/SetupModal'
import { usePlayerStore, type Track } from '@/app/hooks/usePlayerStore'
import { loadAllTracks, saveTracks, updateTrackMeta, deleteTrackFromDB, saveDeckState, loadDeckState, batchUpdateTrackMeta, savePreferences } from '@/app/lib/db'
import { extractVideoMetadata } from '@/app/lib/extractMetadata'
import { processCommand, processFixAllAudio, type PendingUpdate } from '@/app/lib/commandProcessor'
import { createAutomixState, pickNextTrack, buildQueue, getTransitionDuration, calcBeatmatchRate, type AutomixState } from '@/app/lib/automix'
import { automixController } from '@/app/lib/automixEngine'
import { detectBeatGrid, computeEnergyPerBeat, detectSections, findMixInPoint, findMixOutPoint } from '@/app/lib/beatGrid'
import { getTrackBlob } from '@/app/lib/db'
import { setPendingBatch, getPendingBatch, clearPendingBatch, applyPendingBatch, isConfirmation, isCancellation, buildPendingSummary } from '@/app/lib/pendingUpdates'
import { StreamPreview } from '@/components/StreamPreview'
import { RadioIcon, type RadioIconHandle } from '@/components/ui/radio'
import { PlayIcon, type PlayIconHandle } from '@/components/ui/play'
import { LiaRandomSolid } from 'react-icons/lia'

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  const {
    deckA, deckB, crossfader, playlist, library, languageFilter,
    setCrossfader, loadTrack, play, pause, setLanguageFilter,
    buildPlaylist, setLibrary, updateTrack, deleteTrack,
    ejectTrack, cueTrack, togglePlay, incrementPlays,
    autoplayActive, setAutoplay,
    automixActive, setAutomix,
    automixQueue, setAutomixQueue,
  } = usePlayerStore()

  const [showSetup, setShowSetup] = useState(false)
  const [showStream, setShowStream] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [eqVersion, setEqVersion] = useState(0) // bumped on kill toggle to force re-render
  const [micVolume, setMicVolume] = useState(0.8)
  const [micMuted, setMicMuted] = useState(true)
  const [micDucking, setMicDucking] = useState(false)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micGainRef = useRef<GainNode | null>(null)
  const micContextRef = useRef<AudioContext | null>(null)
  const automixIconRef = useRef<RadioIconHandle>(null)
  const autoplayIconRef = useRef<PlayIconHandle>(null)
  const commandBarRef = useRef<CommandBarHandle>(null)
  const deckAPanelRef = useRef<DeckPanelHandle>(null)
  const deckBPanelRef = useRef<DeckPanelHandle>(null)
  const automixStateRef = useRef<AutomixState | null>(null)
  const deckAActive = crossfader <= 50
  const deckBActive = crossfader >= 50
  const [deckAInitialTime, setDeckAInitialTime] = useState(0)
  const [deckBInitialTime, setDeckBInitialTime] = useState(0)
  const deckATimeRef = useRef(0)
  const deckBTimeRef = useRef(0)
  const restoringRef = useRef(true) // block saves during restore

  // Derive volume for each deck from crossfader position (0-100 → 0-1)
  const volumeA = crossfader <= 50 ? 1 : Math.max(0, (100 - crossfader) / 50)
  const volumeB = crossfader >= 50 ? 1 : Math.max(0, crossfader / 50)

  // Load persisted library + deck state from IndexedDB on mount
  useEffect(() => {
    async function restore() {
      try {
        const tracks = await loadAllTracks()
        if (tracks.length > 0) {
          setLibrary(tracks)
        }
        buildPlaylist()

        // Restore deck state
        const deckState = await loadDeckState()
        console.log('[restore] deckState:', deckState)
        console.log('[restore] tracks loaded:', tracks.length)
        if (deckState) {
          const allTracks = tracks.length > 0 ? tracks : usePlayerStore.getState().library
          if (deckState.deckATrackId) {
            const trackA = allTracks.find(t => t.id === deckState.deckATrackId)
            console.log('[restore] Deck A track:', trackA?.title || 'NOT FOUND', 'id:', deckState.deckATrackId)
            if (trackA) {
              loadTrack('A', trackA)
              if (deckState.deckATime > 0) {
                setDeckAInitialTime(deckState.deckATime)
              }
            }
          }
          if (deckState.deckBTrackId) {
            const trackB = allTracks.find(t => t.id === deckState.deckBTrackId)
            console.log('[restore] Deck B track:', trackB?.title || 'NOT FOUND', 'id:', deckState.deckBTrackId)
            if (trackB) {
              loadTrack('B', trackB)
              if (deckState.deckBTime > 0) {
                setDeckBInitialTime(deckState.deckBTime)
              }
            }
          }
          if (deckState.crossfader !== undefined) {
            setCrossfader(deckState.crossfader)
          }

          // Auto-resume playback after a short delay (video needs time to load + seek)
          setTimeout(() => {
            if (deckState.deckAPlaying && deckState.deckATrackId) {
              play('A')
            }
            if (deckState.deckBPlaying && deckState.deckBTrackId) {
              play('B')
            }
          }, 800)
        }
      } catch {
        buildPlaylist()
      }
      // Allow saves after restore is done
      setTimeout(() => { restoringRef.current = false }, 1500)
    }
    restore()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Helper to build current deck persist state
  const buildDeckPersist = useCallback(() => ({
    deckATrackId: deckA.track?.id || null,
    deckBTrackId: deckB.track?.id || null,
    deckATime: deckATimeRef.current,
    deckBTime: deckBTimeRef.current,
    deckAPlaying: deckA.playing,
    deckBPlaying: deckB.playing,
    crossfader,
  }), [deckA.track?.id, deckB.track?.id, deckA.playing, deckB.playing, crossfader])

  // Persist deck state whenever tracks, playing state, or crossfader change
  useEffect(() => {
    if (restoringRef.current) return
    saveDeckState(buildDeckPersist())
  }, [buildDeckPersist])

  // Also persist time periodically (every 2 seconds while playing)
  useEffect(() => {
    const interval = setInterval(() => {
      if (restoringRef.current) return
      if (deckA.playing || deckB.playing) {
        saveDeckState(buildDeckPersist())
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [deckA.playing, deckB.playing, buildDeckPersist])

  // ---------------------------------------------------------------------------
  // Auto-slide crossfader to the deck that just started playing
  // ---------------------------------------------------------------------------

  const slideRef = useRef<number>(0)
  const prevPlayingA = useRef(false)
  const prevPlayingB = useRef(false)

  useEffect(() => {
    const justStartedA = deckA.playing && !prevPlayingA.current
    const justStartedB = deckB.playing && !prevPlayingB.current
    prevPlayingA.current = deckA.playing
    prevPlayingB.current = deckB.playing

    // Only auto-slide when crossfader is NOT at center (50)
    // At center both decks play equally — no slide needed
    if (crossfader === 50) return

    if (justStartedB && !justStartedA && crossfader < 50) {
      // Crossfader is on A side, user started B → slide to full B (100)
      cancelAnimationFrame(slideRef.current)
      const start = crossfader
      const target = 100
      const duration = 3500 // ms
      const startTime = performance.now()
      function animate(now: number) {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setCrossfader(Math.round(start + (target - start) * eased))
        if (progress < 1) slideRef.current = requestAnimationFrame(animate)
      }
      slideRef.current = requestAnimationFrame(animate)
    } else if (justStartedA && !justStartedB && crossfader > 50) {
      // Crossfader is on B side, user started A → slide to full A (0)
      cancelAnimationFrame(slideRef.current)
      const start = crossfader
      const target = 0
      const duration = 3500
      const startTime = performance.now()
      function animate(now: number) {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setCrossfader(Math.round(start + (target - start) * eased))
        if (progress < 1) slideRef.current = requestAnimationFrame(animate)
      }
      slideRef.current = requestAnimationFrame(animate)
    }

    return () => cancelAnimationFrame(slideRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckA.playing, deckB.playing])

  // ---------------------------------------------------------------------------
  // Autoplay engine (smart selection + beatmatching + queue)
  // ---------------------------------------------------------------------------

  const autoplayTransitionRef = useRef(false)

  function handleStartAutoplay() {
    if (autoplayActive) {
      // Stop autoplay
      setAutoplay(false)
      setAutomixQueue([])
      automixStateRef.current = null
      deckAPanelRef.current?.setPlaybackRate(1)
      deckBPanelRef.current?.setPlaybackRate(1)
      return
    }

    if (library.length === 0) return

    // Create smart selection state
    automixStateRef.current = createAutomixState('natural')
    setAutoplay(true)
    setCrossfader(0)

    // If Deck A has no track, pick the best opener
    if (!deckA.track) {
      const opener = pickNextTrack(library, { bpm: 100, key: '8A' } as Track, automixStateRef.current)
      if (opener) {
        loadTrack('A', opener)
        automixStateRef.current.playedIds.add(opener.id)
        setTimeout(() => { play('A'); incrementPlays(opener.id); updateTrackMeta(opener.id, { timesPlayed: (opener.timesPlayed || 0) + 1 }) }, 100)
      }
    } else {
      automixStateRef.current.playedIds.add(deckA.track.id)
      if (!deckA.playing) {
        play('A')
        incrementPlays(deckA.track.id)
        updateTrackMeta(deckA.track.id, { timesPlayed: (deckA.track.timesPlayed || 0) + 1 })
      }
    }

    // Pre-load Deck B if empty, then build queue
    setTimeout(() => {
      const state = usePlayerStore.getState()
      if (!automixStateRef.current || !state.deckA.track) return

      let deckBTrack = state.deckB.track
      if (!deckBTrack) {
        const next = pickNextTrack(library, state.deckA.track, automixStateRef.current)
        if (next) {
          loadTrack('B', next)
          deckBTrack = next
        }
      }

      if (deckBTrack) automixStateRef.current.playedIds.add(deckBTrack.id)

      // Queue = what comes AFTER Deck B
      if (deckBTrack) {
        const queue = buildQueue(library, deckBTrack, automixStateRef.current, 5)
        setAutomixQueue(queue)
      }
    }, 500)
  }

  /** Handle autoplay transition from one deck to the other */
  function autoplayTransition(fromDeck: 'A' | 'B') {
    if (!automixStateRef.current || autoplayTransitionRef.current) return
    autoplayTransitionRef.current = true

    const toDeck = fromDeck === 'A' ? 'B' : 'A'
    const state = usePlayerStore.getState()
    const fromTrack = fromDeck === 'A' ? state.deckA.track : state.deckB.track
    const toTrack = toDeck === 'A' ? state.deckA.track : state.deckB.track

    if (!toTrack || !fromTrack) {
      autoplayTransitionRef.current = false
      return
    }

    const fadeDuration = getTransitionDuration(fromTrack.bpm || 120)

    // Beatmatch: adjust incoming track playback rate to match outgoing BPM
    const beatmatchRate = calcBeatmatchRate(toTrack.bpm || 0, fromTrack.bpm || 0)
    const toPanel = toDeck === 'A' ? deckAPanelRef : deckBPanelRef
    if (beatmatchRate !== 1) {
      toPanel.current?.setPlaybackRate(beatmatchRate)
    }

    // Start the incoming deck
    play(toDeck)
    incrementPlays(toTrack.id)
    updateTrackMeta(toTrack.id, { timesPlayed: (toTrack.timesPlayed || 0) + 1 })

    // Animate crossfader over fadeDuration
    const startCf = fromDeck === 'A' ? 0 : 100
    const endCf = fromDeck === 'A' ? 100 : 0
    const startTime = Date.now()

    const cfInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(1, elapsed / (fadeDuration * 1000))
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
      setCrossfader(Math.round(startCf + (endCf - startCf) * eased))
      if (progress >= 1) clearInterval(cfInterval)
    }, 50)

    // After fade: eject old deck, restore playback rate, load next track
    setTimeout(() => {
      toPanel.current?.setPlaybackRate(1)
      ejectTrack(fromDeck)

      if (automixStateRef.current) {
        automixStateRef.current.totalElapsed += fromTrack.duration || 210

        const s = usePlayerStore.getState()
        const currentPlaying = toDeck === 'A' ? s.deckA.track : s.deckB.track
        if (currentPlaying) {
          const next = pickNextTrack(library, currentPlaying, automixStateRef.current)
          if (next) {
            loadTrack(fromDeck, next)
            automixStateRef.current.playedIds.add(next.id)
            const queue = buildQueue(library, next, automixStateRef.current, 5)
            setAutomixQueue(queue)
          } else {
            setAutomixQueue([])
          }
        }
      }

      autoplayTransitionRef.current = false
    }, (fadeDuration + 1) * 1000)
  }

  // ---------------------------------------------------------------------------
  // Automix engine (real DJ-style mixing with EQ + long overlaps)
  // ---------------------------------------------------------------------------

  // Analyze a track's beat grid + sections in the background
  const analyzeTrack = useCallback(async (track: Track) => {
    if (automixController.getAnalysis(track.id)) return
    const blob = await getTrackBlob(track.id)
    if (!blob) return
    const grid = await detectBeatGrid(blob, track.bpm || undefined)
    if (grid) {
      const energy = await computeEnergyPerBeat(blob, grid)
      const sections = detectSections(grid, energy)
      automixController.setAnalysis(track.id, {
        trackId: track.id, beatGrid: grid, sections,
        mixInPoint: findMixInPoint(sections),
        mixOutPoint: findMixOutPoint(sections, grid),
      })
    }
  }, [])

  // Init automix controller
  useEffect(() => {
    automixController.init({
      deckARef: deckAPanelRef,
      deckBRef: deckBPanelRef,
      onLoadTrack: loadTrack,
      onPlay: play,
      onPause: pause,
      onEject: ejectTrack,
      onSetCrossfader: setCrossfader,
      onQueueUpdate: setAutomixQueue,
      onAnalyzeTrack: analyzeTrack,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleStartAutomix() {
    if (automixActive) {
      setAutomix(false)
      automixController.stop()
      deckAPanelRef.current?.setPlaybackRate(1)
      deckBPanelRef.current?.setPlaybackRate(1)
      return
    }

    if (library.length === 0) return
    if (autoplayActive) setAutoplay(false)

    const amState = createAutomixState('natural')
    setAutomix(true)
    automixController.start(library, amState)

    // Pick a track for Deck A if empty
    const trackA = deckA.track || pickNextTrack(library, { bpm: 120, key: '8A' } as Track, amState)
    if (!trackA) return

    if (!deckA.track) loadTrack('A', trackA)
    amState.playedIds.add(trackA.id)

    // Analyze the first track, then start playing a segment
    setTimeout(async () => {
      await analyzeTrack(trackA)
      automixController.playFirstSegment(trackA)

      // Analyze several library tracks in background for upcoming segments
      const toAnalyze = library.filter(t => t.id !== trackA.id).slice(0, 10)
      for (const t of toAnalyze) {
        await analyzeTrack(t)
      }
    }, 300)
  }

  // ---------------------------------------------------------------------------
  // Time update handlers — trigger autoplay OR automix transitions
  // ---------------------------------------------------------------------------

  const handleDeckATimeUpdate = useCallback((current: number, dur: number) => {
    deckATimeRef.current = current
    if (!dur) return

    // Automix: segment-based DJ transition
    if (automixActive && automixController.shouldTransition(current)) {
      automixController.executeTransition()
      return
    }

    // Autoplay: smart crossfade
    if (autoplayActive && !autoplayTransitionRef.current) {
      const s = usePlayerStore.getState()
      const transitionStart = getTransitionDuration(s.deckA.track?.bpm || 120) + 2
      const remaining = dur - current
      if (remaining <= transitionStart && remaining > 0) {
        autoplayTransition('A')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplayActive, automixActive])

  const handleDeckBTimeUpdate = useCallback((current: number, dur: number) => {
    deckBTimeRef.current = current
    if (!dur) return

    // Automix: segment-based DJ transition (only active deck triggers)
    if (automixActive && automixController.shouldTransition(current)) {
      automixController.executeTransition()
      return
    }

    // Autoplay: smart crossfade
    if (autoplayActive && !autoplayTransitionRef.current) {
      const s = usePlayerStore.getState()
      const transitionStart = getTransitionDuration(s.deckB.track?.bpm || 120) + 2
      const remaining = dur - current
      if (remaining <= transitionStart && remaining > 0) {
        autoplayTransition('B')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplayActive, automixActive])

  // ---------------------------------------------------------------------------
  // Folder picker (used by bottom panel)
  // ---------------------------------------------------------------------------

  const handleOpenFolder = useCallback(async () => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: 'read' })
      toast.info('Scanning folder...')

      const files: File[] = []

      async function scan(handle: FileSystemDirectoryHandle) {
        for await (const entry of (handle as any).values()) {
          if (entry.kind === 'file' && /\.(mp4|mkv|avi|mov|webm|m4v)$/i.test(entry.name)) {
            const file: File = await entry.getFile()
            files.push(file)
          } else if (entry.kind === 'directory') {
            await scan(entry)
          }
        }
      }

      await scan(dir)

      if (files.length > 0) {
        const items: { track: Track; blob: Blob }[] = []
        let idCounter = Date.now()

        for (const file of files) {
          const videoUrl = URL.createObjectURL(file)
          const name = file.name.replace(/\.(mp4|mkv|avi|mov|webm|m4v)$/i, '')
          const meta = await extractVideoMetadata(file)
          items.push({
            track: { id: String(idCounter++), title: name, artist: meta.artist, album: meta.album, remixer: '', genre: meta.genre, language: meta.language, bpm: meta.bpm, key: meta.key, released: '', duration: meta.duration, timesPlayed: 0, thumbnail: meta.thumbnail, file: file.name, videoUrl },
            blob: file,
          })
        }

        // Load existing to detect duplicates by filename
        const existing = await loadAllTracks()
        const existingFiles = new Set(existing.map(t => t.file?.toLowerCase()))
        const newItems = items.filter(i => !existingFiles.has(i.track.file?.toLowerCase()))
        const skipped = items.length - newItems.length

        // Save only new tracks (append, don't clear)
        if (newItems.length > 0) {
          await saveTracks(newItems)
        }

        const newTracks = newItems.map(i => i.track)
        const merged = [...existing, ...newTracks]
        setLibrary(merged)
        buildPlaylist()

        if (skipped > 0) {
          toast.success(`${newTracks.length} new videos added, ${skipped} duplicate(s) skipped`)
        } else {
          toast.success(`${newTracks.length} videos added`)
        }
      } else {
        toast.info('No video files found in that folder')
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        toast.error('Could not open folder')
      }
    }
  }, [setLibrary, buildPlaylist])

  // ---------------------------------------------------------------------------
  // Agent command handler
  // ---------------------------------------------------------------------------

  const buildContext = useCallback(() => ({
    languageFilter,
    deckA_track: deckA.track ? { id: deckA.track.id, title: deckA.track.title, artist: deckA.track.artist, bpm: deckA.track.bpm, key: deckA.track.key, genre: deckA.track.genre } : null,
    deckB_track: deckB.track ? { id: deckB.track.id, title: deckB.track.title, artist: deckB.track.artist, bpm: deckB.track.bpm, key: deckB.track.key, genre: deckB.track.genre } : null,
    playlistLength: playlist.length,
    librarySize: library.length,
    // Send full library metadata (no videoUrl/blobs) for slash commands
    library: library.map(t => ({
      id: t.id, title: t.title, artist: t.artist, album: t.album, remixer: t.remixer,
      genre: t.genre, language: t.language, bpm: t.bpm, key: t.key, released: t.released,
      duration: t.duration, timesPlayed: t.timesPlayed,
    })),
  }), [languageFilter, deckA, deckB, playlist, library])

  const { setPlaylist, batchUpdateTracks } = usePlayerStore()

  const handleCommand = useCallback(async (text: string, conversationHistory?: { role: string; text: string }[], memories?: unknown[], onProgress?: (msg: string) => void): Promise<string> => {
    if (!text.trim()) return ''

    // --- Check for pending batch confirmation/cancellation ---
    const pending = getPendingBatch()
    if (pending) {
      if (isConfirmation(text)) {
        const updates = applyPendingBatch()
        if (updates && updates.length > 0) {
          const batchForStore = updates.map(u => ({ id: u.trackId, changes: u.changes as Partial<Track> }))
          batchUpdateTracks(batchForStore)
          await batchUpdateTrackMeta(batchForStore)
          buildPlaylist() // refresh playlist view with updated metadata
          return `Updated ${updates.length} tracks in your library and database.`
        }
        return 'No pending changes to apply.'
      }
      if (isCancellation(text)) {
        clearPendingBatch()
        return 'Changes discarded.'
      }
    }

    // --- Client-side command processing ---
    const cmdResult = await processCommand(text, library, deckA, deckB, crossfader, onProgress)

    if (cmdResult.handled) {
      // Handle actions
      if (cmdResult.action === 'autoplay_start') handleStartAutoplay()
      if (cmdResult.action === 'automix_start') handleStartAutomix()
      if (cmdResult.action === 'autoplay_stop') { setAutoplay(false); pause('A'); pause('B') }
      if (cmdResult.action === 'open_help') {
        // The CommandBar will handle this via its own state
      }

      // If there are pending updates, store them
      if (cmdResult.pendingUpdates && cmdResult.pendingUpdates.length > 0) {
        setPendingBatch({
          id: Date.now().toString(),
          updates: cmdResult.pendingUpdates,
          source: text.split(/\s+/)[0],
          createdAt: Date.now(),
        })
      }

      return cmdResult.reply || 'Done.'
    }

    // --- Pass-through to Claude API ---
    const isSlashCommand = text.trim().startsWith('/')
    const isFixAll = text.trim().toLowerCase().startsWith('/fix-all')
    const isFixCommand = text.trim().toLowerCase().startsWith('/fix-')

    // Only send full library for slash commands that need it — slim context for chat
    const context = isSlashCommand ? buildContext() : {
      ...buildContext(),
      library: library.slice(0, 10).map(t => ({ id: t.id, title: t.title, artist: t.artist, genre: t.genre })),
      librarySize: library.length,
    }

    // For large libraries with fix commands, batch the API calls
    const BATCH_SIZE = 25
    const needsBatching = isFixCommand && library.length > BATCH_SIZE

    try {
      let allToolCalls: { tool: string; args?: Record<string, unknown> }[] = []
      let finalReply = ''

      if (needsBatching) {
        // Find tracks that need fixing (have at least one empty field)
        const tracksNeedingFix = library.filter(t =>
          !t.artist || !t.album || !t.genre || !t.language || !t.released || !t.remixer ||
          (text.includes('titles') && (!t.title || !t.artist)) ||
          (text.includes('albums') && !t.album) ||
          (text.includes('genres') && !t.genre) ||
          (text.includes('language') && !t.language) ||
          (text.includes('released') && !t.released)
        )

        if (tracksNeedingFix.length === 0) {
          return 'All tracks already have complete metadata!'
        }

        const batches: typeof tracksNeedingFix[] = []
        for (let i = 0; i < tracksNeedingFix.length; i += BATCH_SIZE) {
          batches.push(tracksNeedingFix.slice(i, i + BATCH_SIZE))
        }

        for (let b = 0; b < batches.length; b++) {
          onProgress?.(`Batch ${b + 1}/${batches.length}: Looking up metadata for ${batches[b].length} tracks...`)

          const batchContext = {
            ...context,
            library: batches[b].map(t => ({
              id: t.id, title: t.title, artist: t.artist, album: t.album, remixer: t.remixer,
              genre: t.genre, language: t.language, bpm: t.bpm, key: t.key, released: t.released,
              duration: t.duration, timesPlayed: t.timesPlayed,
            })),
            librarySize: library.length,
            batchInfo: `Batch ${b + 1} of ${batches.length} (${batches[b].length} tracks needing fixes)`,
          }

          const res = await fetch('/api/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, context: batchContext, conversationHistory, memories }),
          })

          if (!res.ok) continue
          const data = await res.json()
          if (!data.success) continue

          if (data.toolCalls) allToolCalls.push(...data.toolCalls)
          if (b === batches.length - 1) finalReply = data.reply || ''
        }
      } else {
        // Single API call
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, context, conversationHistory, memories }),
        })

        if (!res.ok) return `Error: ${res.statusText}`
        const data = await res.json()
        if (!data.success) return `Error: ${data.error || 'Unknown'}`

        allToolCalls = data.toolCalls ?? []
        finalReply = data.reply || ''
        if (data.source === 'mock') finalReply = `${finalReply} (demo mode)`

        // Save preferences if returned (userName, favoriteGenres, etc.)
        if (data.preferences && Object.keys(data.preferences).length > 0) {
          await savePreferences({ ...data.preferences, setupComplete: true })
        }
      }

      // --- Process tool calls ---
      const pendingUpdates: PendingUpdate[] = []
      const actions: string[] = []

      for (const call of allToolCalls) {
        switch (call.tool) {
          case 'set_filter': {
            const lang = (call.args?.language as string) || null
            setLanguageFilter(lang)
            buildPlaylist()
            actions.push(lang ? `${lang.toUpperCase()} filter ON` : 'Filter removed')
            break
          }
          case 'build_playlist':
            buildPlaylist()
            actions.push(`Playlist built — ${library.length} tracks`)
            break
          case 'reorder_playlist': {
            const trackIds = call.args?.track_ids as string[]
            if (trackIds && trackIds.length > 0) {
              const ordered = trackIds
                .map(id => library.find(t => t.id === id))
                .filter(Boolean) as Track[]
              if (ordered.length > 0) {
                setPlaylist(ordered)
                actions.push(`Playlist reordered — ${ordered.length} tracks`)
              }
            }
            break
          }
          case 'load_track': {
            const deck = call.args?.deck as 'A' | 'B'
            const trackId = call.args?.track_id as string
            const track = library.find(t => t.id === trackId)
            if (deck && track) {
              loadTrack(deck, track)
              actions.push(`Loaded "${track.title}" to Deck ${deck}`)
            }
            break
          }
          case 'play':
            play('A')
            play('B')
            actions.push('Playing both decks')
            break
          case 'pause':
            pause('A')
            pause('B')
            actions.push('Paused both decks')
            break
          case 'open_folder_picker':
            handleOpenFolder()
            actions.push('Opening folder picker')
            break
          case 'update_track': {
            const { id, updates } = call.args as { id: string; updates: Record<string, unknown> }
            if (id && updates) {
              // Strip BPM/key — client handles those via audio analysis
              delete updates.bpm
              delete updates.key
              if (Object.keys(updates).length > 0) {
                const track = library.find(t => t.id === id)
                pendingUpdates.push({
                  trackId: id,
                  trackTitle: track?.title || id,
                  trackArtist: track?.artist || '',
                  changes: updates as Partial<Track>,
                  source: 'claude',
                })
              }
            }
            break
          }
        }
      }

      // --- Handle /fix-all hybrid: Claude updates + audio analysis ---
      if (isFixAll) {
        onProgress?.('Now running audio analysis for BPM and key...')
        const audioUpdates = await processFixAllAudio(library, onProgress)
        pendingUpdates.push(...audioUpdates)
      }

      // --- If we collected pending updates, create a confirmation batch ---
      if (pendingUpdates.length > 0) {
        setPendingBatch({
          id: Date.now().toString(),
          updates: pendingUpdates,
          source: text.split(/\s+/)[0],
          createdAt: Date.now(),
        })
        const summary = buildPendingSummary(pendingUpdates)
        return finalReply ? `${finalReply}\n\n${summary}` : summary
      }

      return finalReply || actions.join('. ') || 'Done.'
    } catch (e) {
      return `Error: ${(e as Error).message}`
    }
  }, [buildContext, library, deckA, deckB, crossfader, setLanguageFilter, buildPlaylist, play, pause, handleOpenFolder, setAutoplay, loadTrack, setPlaylist, batchUpdateTracks])

  const handleWelcome = useCallback(async (memories?: unknown[]): Promise<string> => {
    const context = buildContext()
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isWelcome: true, context, memories }),
      })
      const data = await res.json()
      if (data.preferences && Object.keys(data.preferences).length > 0) {
        await savePreferences({ ...data.preferences, setupComplete: true })
      }
      if (data.success) return data.reply
      return "Hey! I'm Linus. What's your name and what music are you into?"
    } catch {
      return "Hey! I'm Linus. What's your name and what music are you into?"
    }
  }, [buildContext])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: 'var(--bg-primary)', color: 'var(--text-primary)', overflow: 'hidden',
    }}>
      {/* Header */}
      <Header
        languageFilter={languageFilter}
        onOpenSetup={() => setShowSetup(true)}
        onOpenStream={() => setShowStream(true)}
        isLive={isLive}
      />

      {/* ── Top 60%: Decks + Mixer ────────────────────────────────────── */}
      <div style={{
        height: '60%', display: 'flex', overflow: 'hidden', minHeight: 0,
      }}>
        {/* Deck A */}
        <DeckPanel
          ref={deckAPanelRef}
          deckId="A"
          deck={deckA}
          isActive={deckAActive}
          volume={volumeA}
          initialTime={deckAInitialTime}
          onPlayPause={() => {
            if (!deckA.playing && deckA.track) {
              incrementPlays(deckA.track.id)
              updateTrackMeta(deckA.track.id, { timesPlayed: (deckA.track.timesPlayed || 0) + 1 })
            }
            togglePlay('A')
          }}
          onCue={() => cueTrack('A')}
          onEject={() => ejectTrack('A')}
          onLoadTrack={t => loadTrack('A', t)}
          onTimeUpdate={handleDeckATimeUpdate}
        />

        {/* Centre — crossfader + queue + EQ + buttons */}
        <div style={{
          width: '25%', minWidth: 200, maxWidth: 400,
          flexShrink: 0,
          background: '#0d0d16',
          borderLeft: '1px solid #2a2a3e',
          borderRight: '1px solid #2a2a3e',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
          padding: '20px 16px',
          gap: 12,
        }}>
          <CrossFader value={crossfader} onChange={setCrossfader} />

          {/* Automix queue preview */}
          {autoplayActive && automixQueue.length > 0 && (
            <div style={{
              width: '100%', flex: 1, minHeight: 0, overflow: 'auto',
              display: 'flex', flexDirection: 'column', gap: 2,
              padding: '6px 0',
            }}>
              <div style={{ fontSize: 8, color: '#ffff00', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                Up Next
              </div>
              {automixQueue.slice(0, 5).map((t, i) => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 6px', borderRadius: 4,
                  background: i === 0 ? 'rgba(255,255,0,0.06)' : 'transparent',
                  border: i === 0 ? '1px solid rgba(255,255,0,0.15)' : '1px solid transparent',
                }}>
                  <span style={{ fontSize: 9, color: '#555570', fontFamily: 'var(--font-mono)', width: 14 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.title}
                    </div>
                    <div style={{ fontSize: 8, color: '#555570', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.artist || 'Unknown'}
                    </div>
                  </div>
                  <span style={{ fontSize: 8, color: '#555570', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    {t.bpm || '?'} · {t.key || '?'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* EQ — Deck A left-aligned, Deck B right-aligned */}
          <div style={{ display: 'flex', width: '100%', gap: 12 }}>
            {/* Deck A EQ — left aligned */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 8, color: '#45b1e8', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>EQ A</span>
              {(['high', 'mid', 'low'] as const).map(band => (
                <EQSlider
                  key={`a-${band}-${eqVersion}`}
                  label={band === 'high' ? 'HI' : band === 'mid' ? 'MID' : 'LO'}
                  accent="#45b1e8"
                  killed={deckAPanelRef.current?.getEQ()?.[`${band}Kill`] || false}
                  onChange={(db: number) => deckAPanelRef.current?.setEQ(band, db)}
                  onKill={() => { deckAPanelRef.current?.toggleKill(band); setEqVersion(v => v + 1) }}
                />
              ))}
            </div>
            {/* Deck B EQ — right aligned label, full width sliders */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 8, color: '#ef4444', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'right' }}>EQ B</span>
              {(['high', 'mid', 'low'] as const).map(band => (
                <EQSlider
                  key={`b-${band}-${eqVersion}`}
                  label={band === 'high' ? 'HI' : band === 'mid' ? 'MID' : 'LO'}
                  accent="#ef4444"
                  killed={deckBPanelRef.current?.getEQ()?.[`${band}Kill`] || false}
                  onChange={(db: number) => deckBPanelRef.current?.setEQ(band, db)}
                  onKill={() => { deckBPanelRef.current?.toggleKill(band); setEqVersion(v => v + 1) }}
                  reverse
                />
              ))}
            </div>
          </div>

          {/* Volume controls — Deck A, Deck B, Mic */}
          <div style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center' }}>
            {/* Deck A vol */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 7, color: '#45b1e8', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>VOL A</span>
              <input
                type="range" min={0} max={100} value={Math.round(volumeA * 100)}
                onChange={e => { const v = Number(e.target.value) / 100; setCrossfader(v <= volumeB ? Math.round((1 - v) * 50) : crossfader) }}
                style={{ width: '100%', height: 3, accentColor: '#45b1e8' }}
                disabled
                title="Controlled by crossfader"
              />
              <span style={{ fontSize: 8, color: '#555570', fontFamily: 'var(--font-mono)' }}>{Math.round(volumeA * 100)}%</span>
            </div>

            {/* Mic */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 7, color: micMuted ? '#555570' : '#ffff00', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>MIC</span>
              <input
                type="range" min={0} max={100} value={Math.round(micVolume * 100)}
                onChange={e => {
                  const v = Number(e.target.value) / 100
                  setMicVolume(v)
                  if (micGainRef.current && micContextRef.current) {
                    micGainRef.current.gain.setTargetAtTime(micMuted ? 0 : v, micContextRef.current.currentTime, 0.02)
                  }
                }}
                style={{ width: '100%', height: 3, accentColor: '#ffff00' }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={async () => {
                    if (micMuted) {
                      // Connect mic
                      try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                        micStreamRef.current = stream
                        const ctx = new AudioContext()
                        micContextRef.current = ctx
                        const source = ctx.createMediaStreamSource(stream)
                        const gain = ctx.createGain()
                        gain.gain.value = micVolume
                        micGainRef.current = gain
                        source.connect(gain)
                        gain.connect(ctx.destination)
                        setMicMuted(false)
                      } catch { /* mic access denied */ }
                    } else {
                      // Mute mic
                      if (micGainRef.current && micContextRef.current) {
                        micGainRef.current.gain.setTargetAtTime(0, micContextRef.current.currentTime, 0.02)
                      }
                      setMicMuted(true)
                    }
                  }}
                  style={{
                    fontSize: 7, fontWeight: 800, padding: '2px 6px', borderRadius: 3,
                    background: micMuted ? 'transparent' : 'rgba(255,255,0,0.15)',
                    color: micMuted ? '#555' : '#ffff00',
                    border: `1px solid ${micMuted ? '#2a2a3e' : 'rgba(255,255,0,0.3)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {micMuted ? 'OFF' : 'ON'}
                </button>
                <button
                  onPointerDown={() => {
                    // Talk-over: duck music to 30%
                    setMicDucking(true)
                    deckAPanelRef.current?.getAudioEngine()?.setVolume(volumeA * 0.3)
                    deckBPanelRef.current?.getAudioEngine()?.setVolume(volumeB * 0.3)
                  }}
                  onPointerUp={() => {
                    // Release: restore music volume
                    setMicDucking(false)
                    deckAPanelRef.current?.getAudioEngine()?.setVolume(volumeA)
                    deckBPanelRef.current?.getAudioEngine()?.setVolume(volumeB)
                  }}
                  onPointerLeave={() => {
                    if (micDucking) {
                      setMicDucking(false)
                      deckAPanelRef.current?.getAudioEngine()?.setVolume(volumeA)
                      deckBPanelRef.current?.getAudioEngine()?.setVolume(volumeB)
                    }
                  }}
                  style={{
                    fontSize: 7, fontWeight: 800, padding: '2px 6px', borderRadius: 3,
                    background: micDucking ? '#ffff00' : 'transparent',
                    color: micDucking ? '#000' : '#555',
                    border: `1px solid ${micDucking ? '#ffff00' : '#2a2a3e'}`,
                    cursor: 'pointer',
                  }}
                >
                  TALK
                </button>
              </div>
            </div>

            {/* Deck B vol */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 7, color: '#ef4444', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>VOL B</span>
              <input
                type="range" min={0} max={100} value={Math.round(volumeB * 100)}
                onChange={() => {}}
                style={{ width: '100%', height: 3, accentColor: '#ef4444' }}
                disabled
                title="Controlled by crossfader"
              />
              <span style={{ fontSize: 8, color: '#555570', fontFamily: 'var(--font-mono)' }}>{Math.round(volumeB * 100)}%</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <motion.button
              onClick={handleStartAutoplay}
              onMouseEnter={() => autoplayIconRef.current?.startAnimation()}
              onMouseLeave={() => autoplayIconRef.current?.stopAnimation()}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10,
                background: autoplayActive ? 'rgba(74,222,128,0.12)' : 'transparent',
                color: autoplayActive ? '#4ade80' : '#888',
                fontWeight: 800, fontSize: 12,
                border: `1px solid ${autoplayActive ? 'rgba(74,222,128,0.35)' : '#2a2a3e'}`,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {autoplayActive
                ? <PlayIcon ref={autoplayIconRef} size={22} />
                : <LiaRandomSolid size={16} />}
              {autoplayActive
                ? (
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span style={{ fontSize: 8, fontWeight: 600, color: '#4ade80', opacity: 0.7, letterSpacing: 1, textTransform: 'uppercase' }}>Autoplay</span>
                    <span style={{ fontSize: 13, fontWeight: 900 }}>Playing</span>
                  </div>
                )
                : 'Autoplay'}
            </motion.button>
            <motion.button
              onClick={handleStartAutomix}
              onMouseEnter={() => automixIconRef.current?.startAnimation()}
              onMouseLeave={() => automixIconRef.current?.stopAnimation()}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10,
                background: automixActive
                  ? 'linear-gradient(135deg, #ffff00, #cccc00)'
                  : 'transparent',
                color: automixActive ? '#000' : '#888',
                fontWeight: 800, fontSize: 12,
                border: automixActive ? 'none' : '1px solid #2a2a3e',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <RadioIcon ref={automixIconRef} size={16} />
              {automixActive ? 'Mixing' : 'Automix'}
            </motion.button>
          </div>
        </div>

        {/* Deck B */}
        <DeckPanel
          ref={deckBPanelRef}
          deckId="B"
          deck={deckB}
          isActive={deckBActive}
          volume={volumeB}
          initialTime={deckBInitialTime}
          onPlayPause={() => {
            if (!deckB.playing && deckB.track) {
              incrementPlays(deckB.track.id)
              updateTrackMeta(deckB.track.id, { timesPlayed: (deckB.track.timesPlayed || 0) + 1 })
            }
            togglePlay('B')
          }}
          onCue={() => cueTrack('B')}
          onEject={() => ejectTrack('B')}
          onLoadTrack={t => loadTrack('B', t)}
          onTimeUpdate={handleDeckBTimeUpdate}
        />
      </div>

      {/* ── Bottom 40%: Video library / playlist ──────────────────────── */}
      <PlaylistPanel
        playlist={playlist}
        library={library}
        languageFilter={languageFilter}
        onLoadTrack={(deck, t) => loadTrack(deck, t)}
        onOpenFolder={handleOpenFolder}
        onUpdateTrack={(id, updates) => { updateTrack(id, updates); updateTrackMeta(id, updates) }}
        onDeleteTrack={(id) => { deleteTrack(id); deleteTrackFromDB(id) }}
      />

      {/* Floating AI DJ agent (bottom-right FAB) */}
      <CommandBar
        ref={commandBarRef}
        onCommand={handleCommand}
        onWelcome={handleWelcome}
        onOpenSettings={() => setShowSetup(true)}
        context={buildContext()}
      />

      {/* Setup modal */}
      <AnimatePresence>
        {showSetup && (
          <SetupModal
            onClose={() => setShowSetup(false)}
            onLibraryLoaded={tracks => {
              if (tracks.length > 0) {
                setLibrary(tracks)
                buildPlaylist()
              }
              toast.success('Library ready')
              setShowSetup(false)
            }}
            onAgentConnected={() => {
              setShowSetup(false)
              commandBarRef.current?.openWithWelcome()
            }}
          />
        )}
      </AnimatePresence>

      {/* Stream Preview */}
      <AnimatePresence>
        {showStream && (
          <StreamPreview
            onClose={() => setShowStream(false)}
            deckARef={deckAPanelRef}
            deckBRef={deckBPanelRef}
            crossfader={crossfader}
            nowPlaying={
              (deckAActive ? deckA.track : deckB.track)
                ? {
                    title: (deckAActive ? deckA.track! : deckB.track!).title,
                    artist: (deckAActive ? deckA.track! : deckB.track!).artist,
                  }
                : null
            }
          />
        )}
      </AnimatePresence>
    </div>
  )
}
