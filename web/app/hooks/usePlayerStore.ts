'use client'
import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  remixer: string
  genre: string
  language: string | null
  bpm: number
  key: string
  released: string
  duration: number
  timesPlayed: number
  thumbnail?: string
  file?: string
  /** Object URL or path to the video file */
  videoUrl?: string
  /** Flagged by /health scan — audio-only, corrupt, or marked with / prefix */
  badFile?: boolean
  /** Reason this file was flagged */
  badReason?: string
  /** RMS loudness (0-1) measured during analysis — used for auto-gain matching */
  loudness?: number
  /** MinIO storage key — set after upload completes */
  minioKey?: string
  /** Upload status: undefined = not started, 'uploading' | 'uploaded' | 'failed' */
  uploadStatus?: 'uploading' | 'uploaded' | 'failed'
  /** Timestamp (seconds) where music effectively ends (before silence/credits) */
  effectiveEndTime?: number
}

export interface DeckState {
  track: Track | null
  playing: boolean
}

export interface UserPlaylist {
  id: string
  name: string
  createdAt: number       // Date.now()
  createdBy: 'user' | 'linus'
  trackIds: string[]
  totalDuration: number   // seconds
}

interface PlayerStore {
  // State
  deckA: DeckState
  deckB: DeckState
  crossfader: number
  playlist: Track[]
  library: Track[]
  languageFilter: string | null
  sidebarOpen: boolean
  autoplayActive: boolean
  automixActive: boolean
  automixQueue: Track[]
  userPlaylists: UserPlaylist[]
  activePlaylistId: string | null  // null = show main library

  // Derived helper
  activeDeck: () => 'A' | 'B'

  // Actions
  setAutoplay: (active: boolean) => void
  setAutomix: (active: boolean) => void
  setAutomixQueue: (queue: Track[]) => void
  setCrossfader: (v: number) => void
  loadTrack: (deck: 'A' | 'B', track: Track) => void
  play: (deck: 'A' | 'B') => void
  pause: (deck: 'A' | 'B') => void
  setLanguageFilter: (lang: string | null) => void
  buildPlaylist: () => void
  setLibrary: (tracks: Track[]) => void
  setSidebarOpen: (open: boolean) => void
  addToLibrary: (tracks: Track[]) => void
  setPlaylist: (tracks: Track[]) => void
  batchUpdateTracks: (updates: { id: string; changes: Partial<Track> }[]) => void
  updateTrack: (id: string, updates: Partial<Track>) => void
  deleteTrack: (id: string) => void
  ejectTrack: (deck: 'A' | 'B') => void
  cueTrack: (deck: 'A' | 'B') => void
  togglePlay: (deck: 'A' | 'B') => void
  incrementPlays: (id: string) => void
  addUserPlaylist: (pl: UserPlaylist) => void
  deleteUserPlaylist: (id: string) => void
  setActivePlaylist: (id: string | null) => void
  setUserPlaylists: (pls: UserPlaylist[]) => void
}

// ---------------------------------------------------------------------------
// Helper: format seconds to m:ss
// ---------------------------------------------------------------------------

export function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Demo library
// ---------------------------------------------------------------------------

const DEMO_LIBRARY: Track[] = []

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  deckA: { track: null, playing: false },
  deckB: { track: null, playing: false },
  crossfader: 50,
  playlist: [],
  library: DEMO_LIBRARY,
  languageFilter: null,
  sidebarOpen: false,
  autoplayActive: false,
  automixActive: false,
  automixQueue: [],
  userPlaylists: [],
  activePlaylistId: null,

  setAutoplay: (active) => set({ autoplayActive: active }),
  setAutomix: (active) => set({ automixActive: active, automixQueue: active ? [] : [] }),
  setAutomixQueue: (queue) => set({ automixQueue: queue }),

  activeDeck: () => (get().crossfader <= 50 ? 'A' : 'B'),

  setCrossfader: (v) => set({ crossfader: v }),

  loadTrack: (deck, track) =>
    set(deck === 'A'
      ? { deckA: { track, playing: false } }
      : { deckB: { track, playing: false } }),

  play: (deck) =>
    set((s) =>
      deck === 'A'
        ? { deckA: { ...s.deckA, playing: true } }
        : { deckB: { ...s.deckB, playing: true } }),

  pause: (deck) =>
    set((s) =>
      deck === 'A'
        ? { deckA: { ...s.deckA, playing: false } }
        : { deckB: { ...s.deckB, playing: false } }),

  setLanguageFilter: (lang) => set({ languageFilter: lang }),

  buildPlaylist: () => {
    const { library, languageFilter } = get()
    const filtered = languageFilter
      ? library.filter((t) => t.language === languageFilter)
      : [...library]
    // Sort A-Z by title
    filtered.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''))
    set({ playlist: filtered })
  },

  setLibrary: (tracks) => {
    const sorted = (tracks.length > 0 ? tracks : DEMO_LIBRARY)
      .slice()
      .sort((a, b) => (a.artist || '').localeCompare(b.artist || ''))
    set({ library: sorted })
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  addToLibrary: (tracks) =>
    set((s) => ({
      library: [...s.library, ...tracks].sort((a, b) => (a.artist || '').localeCompare(b.artist || '')),
    })),

  setPlaylist: (tracks) => set({ playlist: tracks }),

  batchUpdateTracks: (updates) => {
    set((s) => {
      const libMap = new Map(s.library.map(t => [t.id, t]))
      for (const { id, changes } of updates) {
        const track = libMap.get(id)
        if (track) {
          if (changes.language) changes.language = changes.language.toUpperCase()
          libMap.set(id, { ...track, ...changes })
        }
      }
      const library = Array.from(libMap.values())
      const playlistIds = new Set(s.playlist.map(t => t.id))
      const playlist = s.playlist.map(t => libMap.get(t.id) || t).filter(t => playlistIds.has(t.id))
      return { library, playlist }
    })
  },

  updateTrack: (id, updates) => {
    // Always uppercase language
    if (updates.language !== undefined && updates.language) {
      updates.language = updates.language.toUpperCase()
    }
    set((s) => ({
      library: s.library.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      playlist: s.playlist.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }))
  },

  deleteTrack: (id) =>
    set((s) => ({
      library: s.library.filter((t) => t.id !== id),
      playlist: s.playlist.filter((t) => t.id !== id),
    })),

  ejectTrack: (deck) =>
    set(deck === 'A'
      ? { deckA: { track: null, playing: false } }
      : { deckB: { track: null, playing: false } }),

  cueTrack: (deck) =>
    set((s) => {
      const d = deck === 'A' ? s.deckA : s.deckB
      // Pause and reset to start (video currentTime handled in component)
      return deck === 'A'
        ? { deckA: { ...d, playing: false } }
        : { deckB: { ...d, playing: false } }
    }),

  togglePlay: (deck) =>
    set((s) => {
      const d = deck === 'A' ? s.deckA : s.deckB
      return deck === 'A'
        ? { deckA: { ...d, playing: !d.playing } }
        : { deckB: { ...d, playing: !d.playing } }
    }),

  incrementPlays: (id) =>
    set((s) => ({
      library: s.library.map((t) => (t.id === id ? { ...t, timesPlayed: (t.timesPlayed || 0) + 1 } : t)),
      playlist: s.playlist.map((t) => (t.id === id ? { ...t, timesPlayed: (t.timesPlayed || 0) + 1 } : t)),
    })),

  addUserPlaylist: (pl) => set((s) => ({ userPlaylists: [...s.userPlaylists, pl] })),
  deleteUserPlaylist: (id) => set((s) => ({
    userPlaylists: s.userPlaylists.filter(p => p.id !== id),
    activePlaylistId: s.activePlaylistId === id ? null : s.activePlaylistId,
  })),
  setActivePlaylist: (id) => set({ activePlaylistId: id }),
  setUserPlaylists: (pls) => set({ userPlaylists: pls }),
}))
