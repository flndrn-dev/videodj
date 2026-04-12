'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Header } from '@/components/Header'
import { DeckPanel, EQSlider, type DeckPanelHandle } from '@/components/deck/DeckPanel'
import { CrossFader } from '@/components/CrossFader'
import { CommandBar, type CommandBarHandle } from '@/components/command/CommandBar'
import { PlaylistPanel } from '@/components/playlist/PlaylistPanel'
import { PlaylistModal } from '@/components/playlist/PlaylistModal'
import { SetupModal } from '@/components/SetupModal'
import { usePlayerStore, type Track } from '@/app/hooks/usePlayerStore'
import { updateTrackMeta, deleteTrackFromDB, saveDeckState, loadDeckState, batchUpdateTrackMeta, savePreferences, saveUserPlaylist, loadUserPlaylists, deleteUserPlaylistFromDB } from '@/app/lib/db'
import { extractVideoMetadata } from '@/app/lib/extractMetadata'
import { processCommand, processFixAllAudio, type PendingUpdate } from '@/app/lib/commandProcessor'
import { createAutomixState, pickNextTrack, buildQueue, getTransitionStartOffset, calcBeatmatchRate, type AutomixState } from '@/app/lib/automix'
import { automixController } from '@/app/lib/automixEngine'
import { detectBeatGrid, computeEnergyPerBeat, detectSections, findMixInPoint, findMixOutPoint } from '@/app/lib/beatGrid'
import { getTrackBlob } from '@/app/lib/db'
import { setPendingBatch, getPendingBatch, clearPendingBatch, applyPendingBatch, isConfirmation, isCancellation, buildPendingSummary } from '@/app/lib/pendingUpdates'
import { StreamPreview } from '@/components/StreamPreview'
import { setHistory } from '@/app/lib/setHistory'
import { audioDevices, type AudioOutputDevice } from '@/app/lib/audioDevices'
import { mixRecorder, MixRecorder } from '@/app/lib/mixRecorder'
import { RadioIcon, type RadioIconHandle } from '@/components/ui/radio'
import { PlayIcon, type PlayIconHandle } from '@/components/ui/play'
import { LiaRandomSolid } from 'react-icons/lia'
import { initGhost, destroyGhost } from '@/app/lib/ghost'
import { initErrorReporter, setUser as setErrorUser } from '@/app/lib/errorReporter'
import * as syncEngine from '@/app/lib/syncEngine'
import * as scanManager from '@/app/lib/scanManager'
// UploadIndicator removed — files play from local disk
// HelpWidget moved into Header component

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
    userPlaylists, activePlaylistId,
    addUserPlaylist, deleteUserPlaylist, setActivePlaylist, setUserPlaylists,
  } = usePlayerStore()

  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; avatar?: string } | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [showPlaylistModal, setShowPlaylistModal] = useState(false)
  const [showStream, setShowStream] = useState(false)
  const [streamMinimized, setStreamMinimized] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [eqVersion, setEqVersion] = useState(0) // bumped on kill toggle to force re-render
  const [micVolume, setMicVolume] = useState(0.8)
  const [micMuted, setMicMuted] = useState(true)
  const [micDucking, setMicDucking] = useState(false)
  const [videoTransition, setVideoTransition] = useState<'dissolve' | 'cut' | 'wipe-lr' | 'wipe-rl'>('dissolve')
  const micStreamRef = useRef<MediaStream | null>(null)
  const micGainRef = useRef<GainNode | null>(null)
  const micContextRef = useRef<AudioContext | null>(null)
  const automixIconRef = useRef<RadioIconHandle>(null)
  const autoplayIconRef = useRef<PlayIconHandle>(null)
  const commandBarRef = useRef<CommandBarHandle>(null)

  // Audio output device management (global — headphone detection)
  const [outputDevices, setOutputDevices] = useState<AudioOutputDevice[]>([])
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('')
  const hasHeadphones = outputDevices.some(d => d.isHeadphone)
  const deckAPanelRef = useRef<DeckPanelHandle>(null)
  const deckBPanelRef = useRef<DeckPanelHandle>(null)
  const automixStateRef = useRef<AutomixState | null>(null)
  const deckAActive = crossfader <= 50
  const deckBActive = crossfader >= 50
  const [deckAInitialTime, setDeckAInitialTime] = useState(0)
  const [deckBInitialTime, setDeckBInitialTime] = useState(0)
  const restoredDeckATrackId = useRef<string | null>(null)
  const restoredDeckBTrackId = useRef<string | null>(null)
  const deckATimeRef = useRef(0)
  const deckBTimeRef = useRef(0)
  const restoringRef = useRef(true) // block saves during restore

  // Per-deck volume trim (independent of crossfader)
  const [trimA, setTrimA] = useState(1) // 0–1
  const [trimB, setTrimB] = useState(1) // 0–1

  // Derive volume for each deck: crossfader × trim
  const crossfaderA = crossfader <= 50 ? 1 : Math.max(0, (100 - crossfader) / 50)
  const crossfaderB = crossfader >= 50 ? 1 : Math.max(0, crossfader / 50)
  const volumeA = crossfaderA * trimA
  const volumeB = crossfaderB * trimB

  // Compute video styles per deck based on crossfader + transition mode
  const videoStyleA = (() => {
    const opacity = deckA.track?.videoUrl ? crossfaderA * 0.2 : 0
    switch (videoTransition) {
      case 'cut':
        return { opacity: crossfader <= 50 ? 0.15 : 0 }
      case 'wipe-lr':
        return { opacity, clipPath: `inset(0 ${(1 - crossfaderA) * 100}% 0 0)` }
      case 'wipe-rl':
        return { opacity, clipPath: `inset(0 0 0 ${(1 - crossfaderA) * 100}%)` }
      default: // dissolve
        return { opacity }
    }
  })()

  const videoStyleB = (() => {
    const opacity = deckB.track?.videoUrl ? crossfaderB * 0.2 : 0
    switch (videoTransition) {
      case 'cut':
        return { opacity: crossfader >= 50 ? 0.15 : 0 }
      case 'wipe-lr':
        return { opacity, clipPath: `inset(0 0 0 ${(1 - crossfaderB) * 100}%)` }
      case 'wipe-rl':
        return { opacity, clipPath: `inset(0 ${(1 - crossfaderB) * 100}% 0 0)` }
      default: // dissolve
        return { opacity }
    }
  })()

  // Load set history + user playlists from IndexedDB
  useEffect(() => {
    setHistory.loadFromIndexedDB()
    loadUserPlaylists().then(pls => { if (pls.length > 0) setUserPlaylists(pls) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Init audio device detection (headphones, bluetooth, etc.)
  useEffect(() => {
    audioDevices.init().then(setOutputDevices)
    const unsub = audioDevices.onChange(setOutputDevices)
    return unsub
  }, [])

  // Init Ghost — silent background self-healing agent
  useEffect(() => {
    initGhost()
    return () => destroyGhost()
  }, [])

  // Listen for Ghost stalled-video skip events
  useEffect(() => {
    function handleSkipStalled(e: Event) {
      const { deckIndex } = (e as CustomEvent).detail
      const state = usePlayerStore.getState()
      const deck = deckIndex === 0 ? state.deckA : state.deckB
      const deckLabel = deckIndex === 0 ? 'A' : 'B'

      if (!deck.track) return

      // Flag track as bad
      const trackId = deck.track.id
      const trackName = deck.track.title || deck.track.file || 'Unknown'
      updateTrack(trackId, { badFile: true, badReason: 'Video playback failed' })
      updateTrackMeta(trackId, { badFile: true, badReason: 'Video playback failed' })
      syncEngine.syncTrackUpdate(trackId, { badFile: true, badReason: 'Video playback failed' })

      toast.error(`Skipping broken file: ${trackName}`)

      // If autoplay/automix is active, trigger transition to skip to next track
      if (automixStateRef.current) {
        autoplayTransition(deckLabel as 'A' | 'B')
      }
    }

    window.addEventListener('ghost:skip-stalled', handleSkipStalled)
    return () => window.removeEventListener('ghost:skip-stalled', handleSkipStalled)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Route both deck AudioContexts to the selected output device
  const handleSelectAudioDevice = useCallback(async (deviceId: string) => {
    setSelectedAudioDevice(deviceId)
    for (const ref of [deckAPanelRef, deckBPanelRef]) {
      const ctx = ref.current?.getAudioEngine()?.getAudioContext()
      if (ctx) {
        await audioDevices.routeToDevice(ctx, deviceId)
      }
    }
  }, [])

  // Handle Twitch OAuth redirect (runs on every page load)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('twitch_connected') === 'true') {
      localStorage.setItem('twitch_token', params.get('twitch_token') || '')
      localStorage.setItem('twitch_username', params.get('twitch_username') || '')
      localStorage.setItem('twitch_channel', params.get('twitch_channel') || '')
      localStorage.setItem('twitch_stream_key', params.get('twitch_stream_key') || '')
      localStorage.setItem('twitch_user_id', params.get('twitch_user_id') || '')
      // Clean URL params
      window.history.replaceState({}, '', window.location.pathname)
      toast.success(`Connected to Twitch as ${params.get('twitch_username')}`)
    }
    if (params.get('twitch_error')) {
      toast.error(`Twitch: ${params.get('twitch_error')}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Production: load library directly from PostgreSQL on mount (no IndexedDB)
  useEffect(() => {
    async function restore() {
      try {
        // Start cloud sync engine first to resolve userId
        const cloudUserId = await syncEngine.start()
        if (!cloudUserId) {
          console.warn('[restore] No userId — user not logged in')
          return
        }

        // Fetch current user info for header avatar
        fetch('/api/auth/session').then(r => r.ok ? r.json() : null).then(data => {
          if (data?.name) {
            setCurrentUser({ name: data.name, email: data.email, avatar: data.profileData?.avatar })
            // Initialize error reporter with user context
            initErrorReporter()
            setErrorUser(data.userId, data.email)
          }
        }).catch(() => {})

        // Fetch tracks from PostgreSQL (source of truth)
        const cloudTracks = await syncEngine.reconcile()
        console.log(`[restore] ${cloudTracks.length} tracks loaded from PostgreSQL`)

        if (cloudTracks.length > 0) {
          // Load tracks from PostgreSQL — files play from local disk
          setLibrary(cloudTracks as Track[])
          buildPlaylist()
          console.log(`[restore] ${cloudTracks.length} tracks loaded`)

          // Auto-reconnect to persisted folder (restores blob URLs after refresh)
          try {
            const reconnected = await scanManager.reconnectFolder(cloudTracks)
            if (reconnected) {
              setLibrary(reconnected)
              buildPlaylist()
              console.log('[restore] Folder reconnected — tracks playable')
            }
          } catch (err) {
            console.warn('[restore] Folder reconnect failed:', err)
          }
        }

        // Fetch playlists from PostgreSQL
        const cloudPlaylists = await syncEngine.reconcilePlaylists()
        if (cloudPlaylists.length > 0) {
          const setUserPlaylists = usePlayerStore.getState().setUserPlaylists
          setUserPlaylists(cloudPlaylists)
          console.log(`[restore] ${cloudPlaylists.length} playlists loaded from PostgreSQL`)
        }

        // Listen for real-time sync events from other devices/tabs
        syncEngine.onSyncEvent(async (type) => {
          if (type === 'tracks') {
            console.log('[sync] Tracks changed — refetching (preserving local videoUrls)')
            const fresh = await syncEngine.reconcile()
            if (fresh.length > 0) {
              // Preserve local blob URLs from current library
              const currentLib = usePlayerStore.getState().library
              const localUrls = new Map<string, string>()
              for (const t of currentLib) {
                if (t.videoUrl) localUrls.set(t.id, t.videoUrl)
              }
              const withUrls = (fresh as Track[]).map(t => {
                const localUrl = localUrls.get(t.id)
                return localUrl ? { ...t, videoUrl: localUrl } : t
              })
              setLibrary(withUrls)
              buildPlaylist()
            }
          } else if (type === 'playlists') {
            console.log('[sync] Playlists changed on another device — refetching')
            const fresh = await syncEngine.reconcilePlaylists()
            const setUserPlaylists = usePlayerStore.getState().setUserPlaylists
            setUserPlaylists(fresh)
          }
        })

        // Restore deck state (still local IndexedDB — UI state only, not security-sensitive)
        const deckState = await loadDeckState()
        console.log('[restore] deckState:', deckState)
        if (deckState) {
          const allTracks = usePlayerStore.getState().library
          if (deckState.deckATrackId) {
            const trackA = allTracks.find(t => t.id === deckState.deckATrackId)
            console.log('[restore] Deck A track:', trackA?.title || 'NOT FOUND', 'id:', deckState.deckATrackId)
            if (trackA) {
              restoredDeckATrackId.current = trackA.id
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
              restoredDeckBTrackId.current = trackB.id
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

    // No cleanup needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset initialTime when loading a NEW track (not restoring the saved one)
  const handleLoadTrack = useCallback(async (deck: 'A' | 'B', track: Track) => {
    // Check if track has a playable URL (local file reference)
    let resolvedTrack = track
    if (!track.videoUrl && !track.badFile) {
      toast.error(`Can't play "${track.title}" — open your music folder first (Settings → Library)`)
      return
    }

    if (deck === 'A') {
      if (resolvedTrack.id !== restoredDeckATrackId.current) {
        setDeckAInitialTime(0)
      }
      restoredDeckATrackId.current = null
    } else {
      if (resolvedTrack.id !== restoredDeckBTrackId.current) {
        setDeckBInitialTime(0)
      }
      restoredDeckBTrackId.current = null
    }
    loadTrack(deck, resolvedTrack)

    // Auto-gain matching: normalize loudness across tracks
    if (resolvedTrack.loudness && resolvedTrack.loudness > 0) {
      const TARGET_RMS = 0.12
      const gainRatio = Math.min(2, Math.max(0.25, TARGET_RMS / resolvedTrack.loudness))
      if (deck === 'A') setTrimA(gainRatio)
      else setTrimB(gainRatio)
    } else {
      if (deck === 'A') setTrimA(1)
      else setTrimB(1)
    }
  }, [loadTrack])

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
    const amState = createAutomixState('natural')
    automixStateRef.current = amState
    setAutoplay(true)
    setCrossfader(0)

    // Pick Deck A track (if empty)
    let trackA = deckA.track
    if (!trackA) {
      const randomSeed = library[Math.floor(Math.random() * library.length)]
      trackA = pickNextTrack(library, randomSeed, amState) || randomSeed
    }
    amState.playedIds.add(trackA.id)
    amState.recentArtists.push((trackA.artist || '').toLowerCase())

    // Pick Deck B track (always different artist from A)
    const trackB = pickNextTrack(library, trackA, amState)
    if (trackB) {
      amState.playedIds.add(trackB.id)
      amState.recentArtists.push((trackB.artist || '').toLowerCase())
    }

    // Build the Up Next queue FIRST (tracks 3-7) — this is the single source of truth
    const queueSeed = trackB || trackA
    const queue = buildQueue(library, queueSeed, amState, 5)
    setAutomixQueue(queue)

    // Now load decks and start playing
    if (!deckA.track) {
      handleLoadTrack('A', trackA)
      setTimeout(() => { play('A'); incrementPlays(trackA!.id); updateTrackMeta(trackA!.id, { timesPlayed: (trackA!.timesPlayed || 0) + 1 }); syncEngine.syncTrackUpdate(trackA!.id, { timesPlayed: (trackA!.timesPlayed || 0) + 1 }) }, 100)
    } else if (!deckA.playing) {
      play('A')
      incrementPlays(trackA.id)
      updateTrackMeta(trackA.id, { timesPlayed: (trackA.timesPlayed || 0) + 1 })
      syncEngine.syncTrackUpdate(trackA.id, { timesPlayed: (trackA.timesPlayed || 0) + 1 })
    }

    if (trackB) {
      setTimeout(() => { handleLoadTrack('B', trackB) }, 300)
    }
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

    const fadeDuration = 3 // always 3 seconds, linear

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
    syncEngine.syncTrackUpdate(toTrack.id, { timesPlayed: (toTrack.timesPlayed || 0) + 1 })

    // Animate crossfader — smooth linear 3-second slide
    const startCf = fromDeck === 'A' ? 0 : 100
    const endCf = fromDeck === 'A' ? 100 : 0
    const startTime = Date.now()

    const cfInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(1, elapsed / 3000)
      setCrossfader(Math.round(startCf + (endCf - startCf) * progress))
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
        const currentQueue = s.automixQueue

        if (currentPlaying) {
          // Take the FIRST track from the Up Next queue — this is what actually plays next
          let next: Track | null = null
          let remainingQueue = currentQueue

          // Use playlist tracks if a playlist is active, otherwise full library
          const activePlaylist = s.activePlaylistId ? s.userPlaylists.find(p => p.id === s.activePlaylistId) : null
          const trackSource = activePlaylist
            ? library.filter(t => activePlaylist.trackIds.includes(t.id))
            : library

          if (currentQueue.length > 0) {
            next = currentQueue[0]
            remainingQueue = currentQueue.slice(1)
          } else {
            // Queue empty — pick a new track
            next = pickNextTrack(trackSource, currentPlaying, automixStateRef.current)
            if (!next && automixStateRef.current) {
              automixStateRef.current.playedIds = new Set([currentPlaying.id])
              next = pickNextTrack(trackSource, currentPlaying, automixStateRef.current)
            }
          }

          // Skip bad files — keep trying up to 5 times
          let skipAttempts = 0
          while (next?.badFile && skipAttempts < 5) {
            automixStateRef.current.playedIds.add(next.id)
            next = pickNextTrack(trackSource, currentPlaying, automixStateRef.current)
            skipAttempts++
          }

          if (next) {
            handleLoadTrack(fromDeck, next)
            automixStateRef.current.playedIds.add(next.id)
            automixStateRef.current.recentArtists.push((next.artist || '').toLowerCase())

            // Rebuild queue: keep remaining + add new picks to fill 5
            const needed = 5 - remainingQueue.length
            if (needed > 0) {
              const extra = buildQueue(trackSource, next, automixStateRef.current, needed)
              remainingQueue = [...remainingQueue, ...extra]
            }
            setAutomixQueue(remainingQueue.slice(0, 5))
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
      onLoadTrack: handleLoadTrack,
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
    const randomSeedAm = library[Math.floor(Math.random() * library.length)]
    const trackA = deckA.track || pickNextTrack(library, randomSeedAm || { bpm: 120, key: '8A' } as Track, amState)
    if (!trackA) return

    if (!deckA.track) handleLoadTrack('A', trackA)
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

    // Autoplay: smart crossfade — use effectiveEndTime to skip silence at end
    if (autoplayActive && !autoplayTransitionRef.current) {
      const s = usePlayerStore.getState()
      const transitionStart = getTransitionStartOffset(s.deckA.track?.bpm || 120)
      const effectiveEnd = s.deckA.track?.effectiveEndTime || dur
      const remaining = effectiveEnd - current
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

    // Autoplay: smart crossfade — use effectiveEndTime to skip silence at end
    if (autoplayActive && !autoplayTransitionRef.current) {
      const s = usePlayerStore.getState()
      const transitionStart = getTransitionStartOffset(s.deckB.track?.bpm || 120)
      const effectiveEnd = s.deckB.track?.effectiveEndTime || dur
      const remaining = effectiveEnd - current
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
    // Delegates to scanManager (PostgreSQL production path)
    scanManager.setOnComplete((tracks) => {
      setLibrary(tracks)
      buildPlaylist()
    })
    const handled = await scanManager.selectFolder()
    if (!handled) {
      toast.error('Folder picker not supported in this browser')
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
          // Persist each change to PostgreSQL so it survives refresh
          await Promise.allSettled(
            batchForStore.map(({ id, changes }) => syncEngine.syncTrackUpdate(id, changes))
          )
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

    // --- Handle refresh playlist ---
    if (text === '__refresh_playlist') {
      // Reload tracks from PostgreSQL to get latest metadata, then rebuild playlist
      const freshTracks = (await syncEngine.reconcile()) as Track[]
      if (freshTracks.length > 0) {
        // Preserve local blob URLs from current library
        const currentLib = usePlayerStore.getState().library
        const localUrls = new Map<string, string>()
        for (const t of currentLib) {
          if (t.videoUrl) localUrls.set(t.id, t.videoUrl)
        }
        const withUrls = freshTracks.map(t => {
          const localUrl = localUrls.get(t.id)
          return localUrl ? { ...t, videoUrl: localUrl } : t
        })
        setLibrary(withUrls)
      }
      buildPlaylist()
      return `Playlist refreshed — ${freshTracks.length} tracks loaded.`
    }

    // --- Playlist action buttons ---
    if (text === '__start_playing') {
      const s = usePlayerStore.getState()
      if (s.deckA.track && !s.deckA.playing) { play('A') }
      else if (s.deckB.track && !s.deckB.playing) { play('B') }
      return 'Playing.'
    }
    if (text === '__edit_playlist') {
      setShowPlaylistModal(true)
      return '' // no chat reply, modal opens
    }
    if (text === '__remove_playlist') {
      const s = usePlayerStore.getState()
      const activeId = s.activePlaylistId
      if (activeId) {
        deleteUserPlaylist(activeId)
        deleteUserPlaylistFromDB(activeId)
        setActivePlaylist(null)
        return 'Playlist removed from sidebar.'
      }
      return 'No active playlist to remove.'
    }

    // --- Handle "Load Next" from /next suggestions ---
    if (text === '__load_next') {
      const queue = usePlayerStore.getState().automixQueue
      if (queue.length === 0) return 'No suggestions available. Run /next first.'
      const nextTrack = queue[0]
      // Load into the idle deck (opposite of active)
      const activeDeckId = crossfader <= 50 ? 'A' : 'B'
      const idleDeck = activeDeckId === 'A' ? 'B' : 'A'
      handleLoadTrack(idleDeck, nextTrack)
      // Remove loaded track from queue, keep rest as "Next Up"
      setAutomixQueue(queue.slice(1))
      return `Loaded "${nextTrack.artist || 'Unknown'} — ${nextTrack.title}" to Deck ${idleDeck}. ${queue.length - 1} more in queue.`
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
      if (cmdResult.action === 'load_next' && cmdResult.nextTracks?.length) {
        setAutomixQueue(cmdResult.nextTracks)
      }
      if (cmdResult.action === 'automix_playlist' && cmdResult.nextTracks?.length) {
        const tracks = cmdResult.nextTracks
        const plName = cmdResult.playlistName || `Linus Automix — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

        // Create saved playlist with Linus icon
        const totalDuration = tracks.reduce((s, t) => s + (t.duration || 0), 0)
        const userPlaylist: import('@/app/hooks/usePlayerStore').UserPlaylist = {
          id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: plName,
          createdAt: Date.now(),
          createdBy: 'linus',
          trackIds: tracks.map(t => t.id),
          totalDuration,
        }
        addUserPlaylist(userPlaylist)
        saveUserPlaylist(userPlaylist)
        syncEngine.syncPlaylist({ id: userPlaylist.id, name: userPlaylist.name, createdBy: userPlaylist.createdBy, trackIds: userPlaylist.trackIds, totalDuration: userPlaylist.totalDuration })
        setActivePlaylist(userPlaylist.id)
        setPlaylist(tracks)

        // Load first track and start automix
        handleLoadTrack('A', tracks[0])
        setTimeout(() => {
          play('A')
          incrementPlays(tracks[0].id)
          if (tracks[1]) handleLoadTrack('B', tracks[1])
        }, 300)
        setAutomixQueue(tracks.slice(2, 7))

        // Start automix engine (not autoplay)
        if (autoplayActive) setAutoplay(false)
        handleStartAutomix()
      }
      if (cmdResult.action === 'set_playlist' && cmdResult.nextTracks?.length) {
        const tracks = cmdResult.nextTracks
        const plName = cmdResult.playlistName || `Linus Mix — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

        // Create a saved playlist (shows in sidebar with Linus icon)
        const totalDuration = tracks.reduce((s, t) => s + (t.duration || 0), 0)
        const userPlaylist: import('@/app/hooks/usePlayerStore').UserPlaylist = {
          id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: plName,
          createdAt: Date.now(),
          createdBy: 'linus',
          trackIds: tracks.map(t => t.id),
          totalDuration,
        }
        addUserPlaylist(userPlaylist)
        saveUserPlaylist(userPlaylist)
        syncEngine.syncPlaylist({ id: userPlaylist.id, name: userPlaylist.name, createdBy: userPlaylist.createdBy, trackIds: userPlaylist.trackIds, totalDuration: userPlaylist.totalDuration })
        setActivePlaylist(userPlaylist.id)

        // Reorder the playlist view
        setPlaylist(tracks)

        // Load first track into Deck A and start playing
        handleLoadTrack('A', tracks[0])
        setTimeout(() => {
          play('A')
          incrementPlays(tracks[0].id)
          if (tracks[1]) handleLoadTrack('B', tracks[1])
        }, 300)

        // Set Up Next queue (tracks 2-6)
        setAutomixQueue(tracks.slice(2, 7))

        // Start autoplay
        if (!autoplayActive) {
          const amState = createAutomixState('natural')
          automixStateRef.current = amState
          amState.playedIds.add(tracks[0].id)
          if (tracks[1]) amState.playedIds.add(tracks[1].id)
          setAutoplay(true)
          setCrossfader(0)
        }
      }
      if (cmdResult.action === 'start_recording') {
        const engine = deckAPanelRef.current?.getAudioEngine()
        const ctx = engine?.getAudioContext()
        if (ctx) {
          const dest = mixRecorder.start(ctx)
          if (dest) {
            // Connect both deck gain nodes to the recorder
            const gainA = deckAPanelRef.current?.getAudioEngine()?.getGainNode()
            const gainB = deckBPanelRef.current?.getAudioEngine()?.getGainNode()
            gainA?.connect(dest)
            gainB?.connect(dest)
          }
        }
      }
      if (cmdResult.action === 'stop_recording') {
        mixRecorder.stop().then(blob => {
          if (blob.size > 0) MixRecorder.download(blob)
        })
      }
      if (cmdResult.action === 'show_set_history') {
        const history = setHistory.getHistory()
        if (history.length === 0) {
          return 'No sets recorded yet. Play some tracks to start building your history.'
        }
        const list = history.slice(0, 10).map((s, i) =>
          `${i + 1}. ${s.name} — ${s.tracklist.length} tracks, ${Math.round(s.totalDuration / 60)}min`
        ).join('\n')
        return `Recent sets:\n${list}`
      }

      if (cmdResult.action === 'health_results' && cmdResult.healthBadIds?.length) {
        // Mark bad files in the store so they're excluded from autoplay/automix
        const reasons = cmdResult.healthBadReasons || {}
        const updates = cmdResult.healthBadIds.map(id => ({
          id,
          changes: { badFile: true, badReason: reasons[id] || 'Unknown issue' } as Partial<Track>,
        }))
        batchUpdateTracks(updates)
        // Persist to IndexedDB
        for (const { id, changes } of updates) {
          updateTrackMeta(id, changes)
          syncEngine.syncTrackUpdate(id, changes)
        }
        toast.success(`Flagged ${cmdResult.healthBadIds.length} bad files — excluded from autoplay/automix`)
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
    // Parse /fix options: "/fix genres language" → fixOptions = ['genres', 'language']
    const fixArgsRaw = text.trim().replace(/^\/(fix-?\w*)\s*/i, '').toLowerCase()
    const fixOptions = new Set(fixArgsRaw.split(/\s+/).filter(w => ['all', 'titles', 'albums', 'genres', 'language', 'released', 'bpm', 'keys'].includes(w)))
    // Normalize: "/fix genres" → "/fix-genres" for single option, or "/fix-all" for multiple/all
    const cmdWord = text.trim().toLowerCase().split(/\s+/)[0]
    let normalizedText = text
    if (cmdWord === '/fix' && fixOptions.size === 1) {
      normalizedText = `/fix-${[...fixOptions][0]}`
    } else if (cmdWord === '/fix' && (fixOptions.size > 1 || fixOptions.has('all') || fixOptions.size === 0)) {
      normalizedText = '/fix-all'
    } else if (cmdWord.startsWith('/fix-')) {
      normalizedText = text // already normalized
    }
    const isFixAll = normalizedText.trim().toLowerCase().startsWith('/fix-all')
    const isFixCommand = normalizedText.trim().toLowerCase().startsWith('/fix-')

    // Size-aware context: send summary for analysis commands, compact list for playlist commands, slim for chat
    const cmd = normalizedText.trim().toLowerCase().split(/\s+/)[0]
    const isAnalysisCmd = ['/scan', '/library-stats', '/missing'].includes(cmd)
    const isDuplicatesCmd = cmd === '/duplicates'
    const isPlaylistCmd = cmd.startsWith('/playlist') || cmd === '/set' || cmd.startsWith('/stream')

    let contextLibrary: unknown[]
    if (isDuplicatesCmd) {
      // Duplicates needs title+artist for every track to compare
      contextLibrary = library.map(t => ({ id: t.id, title: t.title, artist: t.artist, file: t.file }))
    } else if (isAnalysisCmd) {
      // Send summary stats instead of full library — prevents API overload
      const genreCounts: Record<string, number> = {}
      const langCounts: Record<string, number> = {}
      let missingArtist = 0, missingAlbum = 0, missingGenre = 0, missingLang = 0
      let missingBpm = 0, missingKey = 0, missingReleased = 0
      for (const t of library) {
        if (t.genre) genreCounts[t.genre] = (genreCounts[t.genre] || 0) + 1
        if (t.language) langCounts[t.language] = (langCounts[t.language] || 0) + 1
        if (!t.artist) missingArtist++
        if (!t.album) missingAlbum++
        if (!t.genre) missingGenre++
        if (!t.language) missingLang++
        if (!t.bpm) missingBpm++
        if (!t.key) missingKey++
        if (!t.released) missingReleased++
      }
      contextLibrary = [{
        _summary: true, totalTracks: library.length,
        genreDistribution: genreCounts, languageDistribution: langCounts,
        missing: { artist: missingArtist, album: missingAlbum, genre: missingGenre, language: missingLang, bpm: missingBpm, key: missingKey, released: missingReleased },
        bpmRange: library.length > 0 ? { min: Math.min(...library.filter(t => t.bpm > 0).map(t => t.bpm)), max: Math.max(...library.map(t => t.bpm)) } : null,
      }]
    } else if (isPlaylistCmd) {
      // Compact: only fields needed for playlist building
      contextLibrary = library.map(t => ({ id: t.id, title: t.title, artist: t.artist, bpm: t.bpm, key: t.key, genre: t.genre, duration: t.duration }))
    } else if (isSlashCommand) {
      // Full metadata for fix commands
      contextLibrary = library.map(t => ({
        id: t.id, title: t.title, artist: t.artist, album: t.album, remixer: t.remixer,
        genre: t.genre, language: t.language, bpm: t.bpm, key: t.key, released: t.released,
        duration: t.duration, timesPlayed: t.timesPlayed,
      }))
    } else {
      // Chat — only 10 tracks for context
      contextLibrary = library.slice(0, 10).map(t => ({ id: t.id, title: t.title, artist: t.artist, genre: t.genre }))
    }

    const context = {
      ...buildContext(),
      library: contextLibrary,
      librarySize: library.length,
    }

    // For large libraries with fix commands, batch the API calls
    // Smaller batches = more reliable output from Claude
    const BATCH_SIZE = 10
    const needsBatching = isFixCommand && library.length > BATCH_SIZE

    try {
      let allToolCalls: { tool: string; args?: Record<string, unknown> }[] = []
      let finalReply = ''

      if (needsBatching) {
        // Smart filter: figure out which fields need fixing based on options
        // fixOptions contains the user's choices, or empty = fix all
        const fixing = fixOptions.size > 0 && !fixOptions.has('all') ? fixOptions : new Set(['titles', 'albums', 'genres', 'language', 'released'])
        const tracksNeedingFix = library.filter(t => {
          if (fixing.has('titles') && (!t.artist || !t.title || /\.(mp4|mkv|avi|mov|webm)$/i.test(t.title))) return true
          if (fixing.has('albums') && !t.album) return true
          if (fixing.has('genres') && !t.genre) return true
          if (fixing.has('language') && !t.language) return true
          if (fixing.has('released') && !t.released) return true
          return false
        })
        const fixLabel = [...fixing].join(', ')

        if (tracksNeedingFix.length === 0) {
          return `All tracks already have complete ${fixLabel} data!`
        }

        const totalToFix = tracksNeedingFix.length
        const totalBatches = Math.ceil(totalToFix / BATCH_SIZE)

        // Estimate time: ~5s per batch (API call + processing)
        const estSeconds = totalBatches * 5
        const estMin = Math.ceil(estSeconds / 60)
        let sizeLabel: string
        let timeMsg: string
        if (totalToFix <= 500) {
          sizeLabel = 'small'
          timeMsg = estMin <= 1 ? `Should take under a minute` : `Should take about ${estMin} min`
        } else if (totalToFix <= 2000) {
          sizeLabel = 'medium'
          timeMsg = `Estimated ${estMin}-${estMin + 1} min`
        } else if (totalToFix <= 10000) {
          sizeLabel = 'large'
          timeMsg = `Estimated ${estMin}-${estMin + 3} min — feel free to minimize, I'll notify you when done`
        } else {
          sizeLabel = 'XL'
          timeMsg = `Estimated ${estMin}-${estMin + 5} min — minimize and I'll ping you when it's done`
        }

        onProgress?.(`Found ${totalToFix} tracks to fix (${sizeLabel} library). ${timeMsg}. Processing ${totalBatches} batches...`)

        // Process ALL batches with retry — never stop until every track is attempted
        let successCount = 0
        let failCount = 0
        const updatedIds = new Set<string>()
        let remaining = [...tracksNeedingFix]
        let attempt = 0
        const MAX_ATTEMPTS = 5

        while (remaining.length > 0 && attempt < MAX_ATTEMPTS) {
          attempt++
          const batches: Track[][] = []
          for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
            batches.push(remaining.slice(i, i + BATCH_SIZE))
          }

          if (attempt > 1) {
            onProgress?.(`Retry ${attempt}/${MAX_ATTEMPTS}: ${remaining.length} tracks still need fixing...`)
          }

          const missedThisRound: Track[] = []

          for (let b = 0; b < batches.length; b++) {
            const batch = batches[b]
            const totalProcessed = successCount + failCount
            const pct = Math.round(((totalProcessed + (b * BATCH_SIZE)) / totalToFix) * 100)
            onProgress?.(`[${Math.min(pct, 99)}%] Batch ${b + 1}/${batches.length}${attempt > 1 ? ` (retry ${attempt})` : ''} — ${batch.length} tracks (${successCount} updated)`)

            const batchContext = {
              ...context,
              library: batch.map(t => ({
                id: t.id, title: t.title, artist: t.artist, album: t.album, remixer: t.remixer,
                genre: t.genre, language: t.language, bpm: t.bpm, key: t.key, released: t.released,
                duration: t.duration,
              })),
              librarySize: library.length,
              batchInfo: `Batch of ${batch.length} tracks. Return an update_track call for EVERY track. IDs: ${batch.map(t => t.id).join(', ')}`,
            }

            try {
              const res = await fetch('/api/agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: normalizedText, context: batchContext, conversationHistory: [], memories }),
              })

              if (!res.ok) {
                console.error(`[Linus batch ${b + 1}] HTTP ${res.status}`)
                missedThisRound.push(...batch)
                onProgress?.(`[${Math.min(pct, 99)}%] Batch ${b + 1} failed (HTTP ${res.status})`)
                continue
              }
              const data = await res.json()
              console.log(`[Linus batch ${b + 1}] success=${data.success}, toolCalls=${data.toolCalls?.length || 0}, reply=${data.reply?.slice(0, 100)}`)
              if (!data.success) {
                console.error(`[Linus batch ${b + 1}] Error:`, data.error)
                missedThisRound.push(...batch)
                onProgress?.(`[${Math.min(pct, 99)}%] Batch ${b + 1} error: ${data.error || 'no data'}`)
                continue
              }

              // Extract update_track calls
              const batchUpdates = (data.toolCalls || [])
                .filter((c: { tool: string }) => c.tool === 'update_track')
                .map((c: { args?: Record<string, unknown> }) => {
                  const args = c.args || {}
                  return { id: args.id as string, changes: (args.updates || args) as Partial<Track> }
                })
                .filter((u: { id: string }) => u.id)

              if (batchUpdates.length > 0) {
                batchUpdateTracks(batchUpdates)
                await batchUpdateTrackMeta(batchUpdates)
                // Persist to PostgreSQL
                await Promise.allSettled(
                  batchUpdates.map((u: { id: string; changes: Partial<Track> }) => syncEngine.syncTrackUpdate(u.id, u.changes))
                )
                successCount += batchUpdates.length
                for (const u of batchUpdates) updatedIds.add(u.id)
              }

              // Track which tracks in this batch were NOT updated
              const batchMissed = batch.filter(t => !updatedIds.has(t.id))
              if (batchMissed.length > 0) missedThisRound.push(...batchMissed)

              // Collect non-update tool calls
              const otherCalls = (data.toolCalls || []).filter((c: { tool: string }) => c.tool !== 'update_track')
              if (otherCalls.length > 0) allToolCalls.push(...otherCalls)
            } catch {
              missedThisRound.push(...batch)
            }

            // Yield between batches
            await new Promise(r => setTimeout(r, 100))
          }

          // Prepare retry with only the tracks that were missed
          remaining = missedThisRound
          if (remaining.length > 0 && attempt < MAX_ATTEMPTS) {
            onProgress?.(`${successCount} updated. ${remaining.length} tracks missed — retrying...`)
            await new Promise(r => setTimeout(r, 500))
          }
        }

        // Count final failures
        failCount = remaining.length

        // Refresh playlist view
        buildPlaylist()

        let resultMsg = `Done! Updated ${successCount}/${totalToFix} tracks.`
        if (failCount > 0) {
          resultMsg += ` ${failCount} tracks couldn't be fixed after ${MAX_ATTEMPTS} attempts. Run the command again to retry those.`
        }
        return resultMsg + '\n\n[REFRESH_PLAYLIST]'
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
              handleLoadTrack(deck, track)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildContext, library, deckA, deckB, crossfader, setLanguageFilter, buildPlaylist, play, pause, handleOpenFolder, setAutoplay, handleLoadTrack, setPlaylist, batchUpdateTracks])

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
        onOpenStream={() => { setShowStream(true); setStreamMinimized(false) }}
        isLive={isLive}
        audioDevices={outputDevices}
        hasHeadphones={hasHeadphones}
        selectedAudioDevice={selectedAudioDevice}
        onSelectAudioDevice={handleSelectAudioDevice}
        userName={currentUser?.name}
        userEmail={currentUser?.email}
        userAvatar={currentUser?.avatar}
      />

      {/* ── Top 60%: Decks + Mixer ────────────────────────────────────── */}
      <div className="deck-zone" style={{
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
          videoStyle={videoStyleA}
          onPlayPause={() => {
            if (!deckA.playing && deckA.track) {
              incrementPlays(deckA.track.id)
              updateTrackMeta(deckA.track.id, { timesPlayed: (deckA.track.timesPlayed || 0) + 1 })
              syncEngine.syncTrackUpdate(deckA.track.id, { timesPlayed: (deckA.track.timesPlayed || 0) + 1 })
              setHistory.logTrack(deckA.track.id, deckA.track.title, deckA.track.artist, deckA.track.bpm, deckA.track.key, 'A')
            }
            togglePlay('A')
          }}
          onCue={() => cueTrack('A')}
          onNext={() => {
            const tracks = playlist.length > 0 ? playlist : library
            if (tracks.length === 0) return
            const currentIdx = deckA.track ? tracks.findIndex(t => t.id === deckA.track!.id) : -1
            const nextIdx = (currentIdx + 1) % tracks.length
            handleLoadTrack('A', tracks[nextIdx])
          }}
          onEject={() => ejectTrack('A')}
          onLoadTrack={t => handleLoadTrack('A', t)}
          onTimeUpdate={handleDeckATimeUpdate}
        />

        {/* Centre — crossfader + queue + EQ + buttons */}
        <div className="mixer-column" style={{
          width: '25%', minWidth: 200, maxWidth: 400,
          flexShrink: 0,
          background: '#0d0d16',
          borderLeft: '1px solid #2a2a3e',
          borderRight: '1px solid #2a2a3e',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
          padding: '10px 16px',
          gap: 8,
        }}>
          <CrossFader value={crossfader} onChange={setCrossfader} />

          {/* Autoplay queue — full play order: decks + up next */}
          {autoplayActive && (
            <div style={{
              width: '100%', flex: 1, minHeight: 0, overflow: 'auto',
              display: 'flex', flexDirection: 'column', gap: 2,
              padding: '6px 0',
            }}>
              <div style={{ fontSize: 8, color: '#ffff00', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                Play Order
              </div>
              {(() => {
                const deckATrack = deckA.track
                const deckBTrack = deckB.track
                const aDeckPlaying = deckA.playing
                const bDeckPlaying = deckB.playing
                // Build full play order: currently playing deck first, then loaded deck, then queue
                const playOrder: { track: Track; label: string; highlight: string }[] = []
                if (aDeckPlaying && deckATrack) {
                  playOrder.push({ track: deckATrack, label: 'A', highlight: '#45b1e8' })
                  if (deckBTrack) playOrder.push({ track: deckBTrack, label: 'B', highlight: '#ef4444' })
                } else if (bDeckPlaying && deckBTrack) {
                  playOrder.push({ track: deckBTrack, label: 'B', highlight: '#ef4444' })
                  if (deckATrack) playOrder.push({ track: deckATrack, label: 'A', highlight: '#45b1e8' })
                } else {
                  if (deckATrack) playOrder.push({ track: deckATrack, label: 'A', highlight: '#45b1e8' })
                  if (deckBTrack) playOrder.push({ track: deckBTrack, label: 'B', highlight: '#ef4444' })
                }
                const queueItems = automixQueue.slice(0, 5).map((t, i) => ({
                  track: t, label: String(playOrder.length + i + 1), highlight: '',
                }))
                return [...playOrder, ...queueItems].map((item, i) => {
                  const isDeck = item.label === 'A' || item.label === 'B'
                  const isPlaying = i === 0
                  const isOnDeck = isDeck && !isPlaying
                  return (
                    <div key={`${item.track.id}-${i}`} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '3px 6px', borderRadius: 4,
                      background: isPlaying ? 'rgba(255,255,0,0.08)' : isOnDeck ? 'rgba(255,255,255,0.03)' : 'transparent',
                      border: isPlaying ? '1px solid rgba(255,255,0,0.2)' : '1px solid transparent',
                      opacity: isPlaying ? 1 : isOnDeck ? 0.85 : 0.6,
                    }}>
                      <span style={{
                        fontSize: 8, fontFamily: 'var(--font-mono)', width: 16, textAlign: 'center', flexShrink: 0,
                        color: isDeck ? item.highlight : '#555570',
                        fontWeight: isDeck ? 700 : 400,
                      }}>
                        {isDeck ? item.label : item.label}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          color: isPlaying ? '#fff' : '#aaa',
                        }}>
                          {item.track.title}
                        </div>
                        <div style={{ fontSize: 8, color: '#555570', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.track.artist || 'Unknown'}
                        </div>
                      </div>
                      <span style={{ fontSize: 8, color: '#555570', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                        {item.track.bpm || '?'} · {item.track.key || '?'}
                      </span>
                    </div>
                  )
                })
              })()}
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

          {/* Volume + Mic — crossfader style sliders with snap points */}
          <div style={{ display: 'flex', width: '100%', gap: 6, alignItems: 'flex-start' }}>
            {/* Deck A vol — draggable trim with snap */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 7, color: '#45b1e8', fontFamily: 'var(--font-mono)', letterSpacing: 1, fontWeight: 800, flexShrink: 0 }}>A</span>
                <div
                  onPointerDown={e => {
                    const track = e.currentTarget
                    const rect = track.getBoundingClientRect()
                    const snaps = [0, 0.25, 0.5, 0.75, 1]
                    const snapRange = 0.04
                    const update = (clientX: number) => {
                      let ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
                      for (const s of snaps) { if (Math.abs(ratio - s) < snapRange) { ratio = s; break } }
                      setTrimA(ratio)
                    }
                    update(e.clientX)
                    const onMove = (ev: PointerEvent) => update(ev.clientX)
                    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
                    window.addEventListener('pointermove', onMove)
                    window.addEventListener('pointerup', onUp)
                  }}
                  style={{ flex: 1, height: 12, borderRadius: 2, background: 'transparent', position: 'relative', cursor: 'pointer' }}
                >
                  {/* Track line */}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 3, background: '#1a1a2e', borderRadius: 2 }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.round(trimA * 100)}%`, background: '#45b1e8', borderRadius: 2, opacity: 0.6 }} />
                  </div>
                  {/* Snap tick marks: 0%, 25%, 50%, 75%, 100% */}
                  {[0, 25, 50, 75, 100].map(pct => (
                    <div key={pct} style={{
                      position: 'absolute', left: `${pct}%`, top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 1, height: pct === 0 || pct === 50 || pct === 100 ? 10 : 6,
                      background: 'rgba(69,177,232,0.4)',
                    }} />
                  ))}
                  {/* Thumb */}
                  <div style={{
                    position: 'absolute', left: `${Math.round(trimA * 100)}%`, top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#1a1a2e', border: '2px solid #45b1e8',
                    zIndex: 1,
                  }} />
                </div>
                <span style={{ fontSize: 7, color: '#555570', fontFamily: 'var(--font-mono)', width: 22, textAlign: 'right', flexShrink: 0 }}>{Math.round(trimA * 100)}%</span>
              </div>
            </div>

            {/* Mic — with pointer-based slider */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* Mic connected indicator dot */}
                <div style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                  background: !micMuted ? '#4ade80' : micStreamRef.current ? '#ffff00' : '#333348',
                  boxShadow: !micMuted ? '0 0 4px #4ade80' : 'none',
                }} />
                <span style={{
                  fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: 1, fontWeight: 800, flexShrink: 0,
                  color: !micMuted ? '#4ade80' : '#555570',
                }}>MIC</span>
                <div
                  onPointerDown={e => {
                    const track = e.currentTarget
                    const rect = track.getBoundingClientRect()
                    const update = (clientX: number) => {
                      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
                      setMicVolume(ratio)
                      if (micGainRef.current && micContextRef.current && !micMuted) {
                        micGainRef.current.gain.setTargetAtTime(ratio, micContextRef.current.currentTime, 0.02)
                      }
                    }
                    update(e.clientX)
                    const onMove = (ev: PointerEvent) => update(ev.clientX)
                    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
                    window.addEventListener('pointermove', onMove)
                    window.addEventListener('pointerup', onUp)
                  }}
                  style={{ flex: 1, height: 3, borderRadius: 2, background: '#1a1a2e', position: 'relative', cursor: 'pointer' }}
                >
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${Math.round(micVolume * 100)}%`,
                    background: !micMuted ? '#4ade80' : '#ffff00', borderRadius: 2, opacity: 0.6,
                  }} />
                  <div style={{
                    position: 'absolute', left: `${Math.round(micVolume * 100)}%`, top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#1a1a2e', border: `2px solid ${!micMuted ? '#4ade80' : '#555570'}`,
                  }} />
                </div>
                <span style={{ fontSize: 7, color: '#555570', fontFamily: 'var(--font-mono)', width: 22, textAlign: 'right', flexShrink: 0 }}>{Math.round(micVolume * 100)}%</span>
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                <button
                  onClick={async () => {
                    if (micMuted) {
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
                      if (micGainRef.current && micContextRef.current) {
                        micGainRef.current.gain.setTargetAtTime(0, micContextRef.current.currentTime, 0.02)
                      }
                      setMicMuted(true)
                    }
                  }}
                  style={{
                    fontSize: 7, fontWeight: 800, padding: '2px 8px', borderRadius: 3,
                    background: !micMuted ? '#4ade80' : 'transparent',
                    color: !micMuted ? '#000' : '#555',
                    border: `1px solid ${!micMuted ? '#4ade80' : '#2a2a3e'}`,
                    cursor: 'pointer',
                  }}
                >
                  {!micMuted ? 'ON' : 'OFF'}
                </button>
                <button
                  onPointerDown={() => {
                    setMicDucking(true)
                    deckAPanelRef.current?.getAudioEngine()?.setVolume(volumeA * 0.3)
                    deckBPanelRef.current?.getAudioEngine()?.setVolume(volumeB * 0.3)
                  }}
                  onPointerUp={() => {
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
                    fontSize: 7, fontWeight: 800, padding: '2px 8px', borderRadius: 3,
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

            {/* Deck B vol — draggable trim with snap */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 7, color: '#555570', fontFamily: 'var(--font-mono)', width: 22, flexShrink: 0 }}>{Math.round(trimB * 100)}%</span>
                <div
                  onPointerDown={e => {
                    const track = e.currentTarget
                    const rect = track.getBoundingClientRect()
                    const snaps = [0, 0.25, 0.5, 0.75, 1]
                    const snapRange = 0.04
                    const update = (clientX: number) => {
                      let ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
                      for (const s of snaps) { if (Math.abs(ratio - s) < snapRange) { ratio = s; break } }
                      setTrimB(ratio)
                    }
                    update(e.clientX)
                    const onMove = (ev: PointerEvent) => update(ev.clientX)
                    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
                    window.addEventListener('pointermove', onMove)
                    window.addEventListener('pointerup', onUp)
                  }}
                  style={{ flex: 1, height: 12, borderRadius: 2, background: 'transparent', position: 'relative', cursor: 'pointer' }}
                >
                  {/* Track line */}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 3, background: '#1a1a2e', borderRadius: 2 }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.round(trimB * 100)}%`, background: '#ef4444', borderRadius: 2, opacity: 0.6 }} />
                  </div>
                  {/* Snap tick marks */}
                  {[0, 25, 50, 75, 100].map(pct => (
                    <div key={pct} style={{
                      position: 'absolute', left: `${pct}%`, top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 1, height: pct === 0 || pct === 50 || pct === 100 ? 10 : 6,
                      background: 'rgba(239,68,68,0.4)',
                    }} />
                  ))}
                  {/* Thumb */}
                  <div style={{
                    position: 'absolute', left: `${Math.round(trimB * 100)}%`, top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#1a1a2e', border: '2px solid #ef4444',
                    zIndex: 1,
                  }} />
                </div>
                <span style={{ fontSize: 7, color: '#ef4444', fontFamily: 'var(--font-mono)', letterSpacing: 1, fontWeight: 800, flexShrink: 0 }}>B</span>
              </div>
            </div>
          </div>

          {/* Video transition mode selector */}
          <div style={{ display: 'flex', gap: 4, width: '100%', justifyContent: 'center' }}>
            {([
              { id: 'dissolve', label: 'DISSOLVE' },
              { id: 'cut', label: 'CUT' },
              { id: 'wipe-lr', label: 'WIPE →' },
              { id: 'wipe-rl', label: '← WIPE' },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => setVideoTransition(t.id)}
                style={{
                  fontSize: 7, fontWeight: 800, padding: '3px 8px', borderRadius: 3,
                  background: videoTransition === t.id ? '#ffff00' : 'transparent',
                  color: videoTransition === t.id ? '#000' : '#444',
                  border: `1px solid ${videoTransition === t.id ? '#ffff00' : '#2a2a3e'}`,
                  cursor: 'pointer', letterSpacing: 0.5,
                }}
              >
                {t.label}
              </button>
            ))}
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
          videoStyle={videoStyleB}
          onPlayPause={() => {
            if (!deckB.playing && deckB.track) {
              incrementPlays(deckB.track.id)
              updateTrackMeta(deckB.track.id, { timesPlayed: (deckB.track.timesPlayed || 0) + 1 })
              syncEngine.syncTrackUpdate(deckB.track.id, { timesPlayed: (deckB.track.timesPlayed || 0) + 1 })
              setHistory.logTrack(deckB.track.id, deckB.track.title, deckB.track.artist, deckB.track.bpm, deckB.track.key, 'B')
            }
            togglePlay('B')
          }}
          onCue={() => cueTrack('B')}
          onNext={() => {
            const tracks = playlist.length > 0 ? playlist : library
            if (tracks.length === 0) return
            const currentIdx = deckB.track ? tracks.findIndex(t => t.id === deckB.track!.id) : -1
            const nextIdx = (currentIdx + 1) % tracks.length
            handleLoadTrack('B', tracks[nextIdx])
          }}
          onEject={() => ejectTrack('B')}
          onLoadTrack={t => handleLoadTrack('B', t)}
          onTimeUpdate={handleDeckBTimeUpdate}
        />
      </div>

      {/* ── Bottom 40%: Video library / playlist ──────────────────────── */}
      <PlaylistPanel
        playlist={playlist}
        library={library}
        languageFilter={languageFilter}
        userPlaylists={userPlaylists}
        activePlaylistId={activePlaylistId}
        onLoadTrack={(deck, t) => handleLoadTrack(deck, t)}
        onOpenFolder={handleOpenFolder}
        onUpdateTrack={(id, updates) => { updateTrack(id, updates); updateTrackMeta(id, updates); syncEngine.syncTrackUpdate(id, updates) }}
        onDeleteTrack={(id) => { deleteTrack(id); deleteTrackFromDB(id); fetch(`/api/tracks?id=${id}`, { method: 'DELETE' }).catch(() => {}) }}
        onCreatePlaylist={() => setShowPlaylistModal(true)}
        onSelectPlaylist={(id) => setActivePlaylist(id)}
        onDeletePlaylist={(id) => { deleteUserPlaylist(id); deleteUserPlaylistFromDB(id); syncEngine.deletePlaylistFromCloud(id) }}
        onPlayPlaylist={(id) => {
          setActivePlaylist(id)
          const pl = userPlaylists.find(p => p.id === id)
          if (!pl) return
          const plTracks = library.filter(t => pl.trackIds.includes(t.id))
          if (plTracks.length === 0) return
          setPlaylist(plTracks)

          // Stop current autoplay if running
          if (autoplayActive) {
            setAutoplay(false)
            setAutomixQueue([])
            automixStateRef.current = null
          }

          // Start autoplay using ONLY the playlist tracks
          const amState = createAutomixState('natural')
          automixStateRef.current = amState
          setAutoplay(true)
          setCrossfader(0)

          const randomSeed = plTracks[Math.floor(Math.random() * plTracks.length)]
          const trackA = pickNextTrack(plTracks, randomSeed, amState) || randomSeed
          amState.playedIds.add(trackA.id)

          const trackB = pickNextTrack(plTracks, trackA, amState)
          if (trackB) amState.playedIds.add(trackB.id)

          const queue = buildQueue(plTracks, trackB || trackA, amState, 5)
          setAutomixQueue(queue)

          handleLoadTrack('A', trackA)
          setTimeout(() => { play('A'); incrementPlays(trackA.id) }, 100)
          if (trackB) {
            handleLoadTrack('B', trackB)
          }
        }}
        streamMinimized={streamMinimized}
        onOpenStream={() => { setShowStream(true); setStreamMinimized(false) }}
        onExportLibrary={async () => {
          toast.info('Preparing export...')
          const tracks = (await syncEngine.reconcile()) as Track[]
          if (tracks.length === 0) { toast.error('No tracks to export'); return }

          // Export metadata as JSON
          const metadata = tracks.map(t => ({
            filename: t.file || `${t.artist} - ${t.title}.mp4`,
            title: t.title, artist: t.artist, album: t.album,
            genre: t.genre, language: t.language, bpm: t.bpm,
            key: t.key, released: t.released, duration: t.duration,
            remixer: t.remixer, timesPlayed: t.timesPlayed,
          }))
          const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
          const jsonUrl = URL.createObjectURL(jsonBlob)
          const a = document.createElement('a')
          a.href = jsonUrl
          a.download = `videodj-library-${new Date().toISOString().slice(0, 10)}.json`
          a.click()
          URL.revokeObjectURL(jsonUrl)

          // Also export as CSV
          const csvHeader = 'Filename,Title,Artist,Album,Genre,Language,BPM,Key,Released,Duration,Remixer'
          const csvRows = metadata.map(t =>
            [t.filename, t.title, t.artist, t.album, t.genre, t.language, t.bpm, t.key, t.released, t.duration, t.remixer]
              .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
              .join(',')
          )
          const csvBlob = new Blob([csvHeader + '\n' + csvRows.join('\n')], { type: 'text/csv' })
          const csvUrl = URL.createObjectURL(csvBlob)
          const b = document.createElement('a')
          b.href = csvUrl
          b.download = `videodj-library-${new Date().toISOString().slice(0, 10)}.csv`
          b.click()
          URL.revokeObjectURL(csvUrl)

          toast.success(`Exported ${tracks.length} tracks (JSON + CSV)`)
        }}
      />
      {/* No upload indicator — files play from local disk */}

      {/* Playlist creation modal */}
      {showPlaylistModal && (
        <PlaylistModal
          library={library}
          onClose={() => setShowPlaylistModal(false)}
          onCreate={(pl) => {
            addUserPlaylist(pl)
            saveUserPlaylist(pl)
            syncEngine.syncPlaylist({ id: pl.id, name: pl.name, createdBy: pl.createdBy, trackIds: pl.trackIds, totalDuration: pl.totalDuration })
            setActivePlaylist(pl.id)
            setShowPlaylistModal(false)
          }}
        />
      )}

      {/* Upload indicator moved into playlist panel area above */}

      {/* Help widget moved to Header */}

      {/* Floating AI DJ agent (bottom-right FAB) */}
      <CommandBar
        ref={commandBarRef}
        onCommand={handleCommand}
        onDeleteTrack={(id) => { deleteTrack(id); deleteTrackFromDB(id); fetch(`/api/tracks?id=${id}`, { method: 'DELETE' }).catch(() => {}) }}
        onWelcome={handleWelcome}
        onOpenSettings={() => setShowSetup(true)}
        context={buildContext()}
      />

      {/* Setup modal */}
      <AnimatePresence>
        {showSetup && (
          <SetupModal
            onClose={() => setShowSetup(false)}
            onLibraryLoaded={async tracks => {
              if (tracks.length > 0) {
                setLibrary(tracks)
                buildPlaylist()
              }
              toast.success('Library ready')

              // Auto health scan — test playability of all tracks
              if (tracks.length > 0) {
                setTimeout(async () => {
                  await scanManager.healthScan(tracks, (trackId, badFile, badReason) => {
                    updateTrack(trackId, { badFile, badReason: badReason || undefined })
                  })
                }, 1000)
              }
            }}
            onAgentConnected={() => {
              // Don't close modal — stay on settings, just trigger Linus welcome
              commandBarRef.current?.openWithWelcome()
            }}
          />
        )}
      </AnimatePresence>

      {/* Stream Preview — stays mounted when minimized to keep WebSocket + MediaRecorder alive */}
      {(showStream || streamMinimized) && (
        <div style={{ display: showStream ? 'contents' : 'none' }}>
          <StreamPreview
            onClose={() => { setShowStream(false); setStreamMinimized(false) }}
            onMinimize={() => { setShowStream(false); setStreamMinimized(true) }}
            deckARef={deckAPanelRef}
            deckBRef={deckBPanelRef}
            crossfader={crossfader}
            nowPlaying={
              (deckAActive ? deckA.track : deckB.track)
                ? {
                    title: (deckAActive ? deckA.track! : deckB.track!).title,
                    artist: (deckAActive ? deckA.track! : deckB.track!).artist,
                    released: (deckAActive ? deckA.track! : deckB.track!).released,
                    thumbnail: (deckAActive ? deckA.track! : deckB.track!).thumbnail,
                  }
                : null
            }
            onStartPlaying={() => {
              // Auto-load track if deck A is empty
              if (!deckA.track && library.length > 0) {
                const activePlaylist = activePlaylistId ? userPlaylists.find(p => p.id === activePlaylistId) : null
                const trackSource = activePlaylist ? library.filter(t => activePlaylist.trackIds.includes(t.id)) : library
                if (trackSource.length > 0) {
                  const track = trackSource[Math.floor(Math.random() * trackSource.length)]
                  handleLoadTrack('A', track)
                  setTimeout(() => play('A'), 200)
                }
              } else if (deckA.track) {
                play('A')
              }
              // Start autoplay if not already running
              if (!autoplayActive && library.length > 0) {
                setTimeout(() => handleStartAutoplay(), 500)
              }
            }}
          />
        </div>
      )}

    </div>
  )
}
